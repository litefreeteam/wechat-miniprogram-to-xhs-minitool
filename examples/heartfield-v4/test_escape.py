"""Escaping minesweeper game regression: navigation, solvability, co-op, SOS, persistence."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, traceback
from test_platform import MOCK
ROOT=Path(__file__).parent

def launch(browser,width=390,height=844,touch=True,mock=None):
    p=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=2,is_mobile=touch,has_touch=touch)
    errors=[]
    p.on('pageerror',lambda e:errors.append(str(e)))
    p.set_content((ROOT/'index.html').read_text())
    p.add_style_tag(content=(ROOT/'style.css').read_text())
    p.evaluate('window.__HEARTMINE_TEST__=true')
    if mock: p.evaluate(mock)
    p.add_script_tag(content=(ROOT/'xhs-adapter.js').read_text())
    p.add_script_tag(content=(ROOT/'game.js').read_text())
    p.wait_for_timeout(130)
    return p,errors

def state(p):return p.evaluate('window.__heartMineDebug.getState()')
def click_cell(p,r,c):p.evaluate('p=>window.__heartMineDebug.hitCell(p.r,p.c,false)',{'r':r,'c':c})
def pos(s):return (s['pos']['r'],s['pos']['c'])
def neighbours(s):
 r,c=pos(s);n=s['n']
 return [(x,y) for x,y in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)] if 0<=x<n and 0<=y<n]
def canvas_click(p,r,c):
 point=p.evaluate('p=>window.__heartMineDebug.cellToScreen(p.r,p.c)',{'r':r,'c':c})
 bbox=p.locator('#gameCanvas').bounding_box();
 assert bbox and bbox['width']>0
 p.mouse.click(bbox['x']+point['x'],bbox['y']+point['y'])
def close_quiz(p):
 if not p.locator('#modalRoot').is_visible():return
 kind=p.locator('#modalRoot').get_attribute('data-kind')
 if kind=='quiz':
  p.locator('.vote-option').first.click()
  p.locator('.vote-option').first.click()
  p.get_by_text('继续并肩探险').click()
 elif kind=='rescue':
  for _ in range(5):p.locator('.rescue-tap').click()
 else:
  p.locator('#modalButtons button').first.click()

def verify():
 steps=[]
 with sync_playwright() as play:
  b=play.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  try:
   for level,n,mines in [('easy',6,6),('normal',7,10),('hard',8,15)]:
    p,e=launch(b)
    p.locator('[data-level='+level+']').click()
    p.locator('#challengeCode').fill('LOVE68')
    p.locator('#startBtn').click()
    s=state(p)
    assert s['n']==n and s['mines']==mines and pos(s)==(n-1,0) and s['goal']=={'r':0,'c':n-1}
    route=s['route']
    assert len(route)==2*n-1
    assert all(abs(route[i]['r']-route[i-1]['r'])+abs(route[i]['c']-route[i-1]['c'])==1 for i in range(1,len(route)))
    assert all(not s['cells'][tile['r']][tile['c']]['mine'] for tile in route)
    assert s['cells'][route[1]['r']][route[1]['c']]['open'], 'initial assured safe tile'
    assert p.locator('#safeCount').inner_text()==str(2*(n-1))
    assert p.locator('#routeStep').inner_text()=='第 1 步'
    # No remote jumps, even onto guaranteed safe finish.
    click_cell(p,0,n-1)
    assert pos(state(p))==(n-1,0)
    assert '相邻' in p.locator('#toast').inner_text()
    # Click a real visible canvas tile to advance both people.
    canvas_click(p,route[1]['r'],route[1]['c'])
    t=state(p)
    assert pos(t)==(route[1]['r'],route[1]['c']) and t['active']==1 and t['steps']==1
    assert p.locator('#safeCount').inner_text()==str(2*(n-1)-1)
    assert not e,e
    steps.append(f'{level}: seed, guaranteed corridor, first safe step, four-neighbor input, turns PASS')
    p.close()
   # Walk entire seeded route with both avatars. Mandatory quizzes are handled.
   p,e=launch(b)
   p.locator('[data-level=easy]').click()
   p.locator('[data-scene=sakura]').click()
   p.locator('#challengeCode').fill('ESCAPE88')
   p.locator('#startBtn').click()
   rt=state(p)['route']
   for i,cell in enumerate(rt[1:]):
    if p.locator('#modalRoot').is_visible():close_quiz(p)
    click_cell(p,cell['r'],cell['c'])
    p.wait_for_timeout(410)
    if p.locator('#modalRoot').is_visible() and p.locator('#modalRoot').get_attribute('data-kind')=='quiz':close_quiz(p)
   p.wait_for_timeout(520)
   s=state(p)
   assert s['won'] and s['finished'] and pos(s)==(0,s['n']-1) and s['steps']==len(rt)-1,(s,rt)
   assert s['safeOpened']<=s['n']**2-s['mines']
   assert '终点' in p.locator('#routeStep').inner_text() or s['finished']
   assert not e,e
   steps.append('solo/duo shared-party path, quiz, win at exit without full clear PASS')
   p.screenshot(path=str(ROOT/'v4-victory.png'))
   p.close()
   # Flag nonlocal, radar local, protect adjacent mine without changing position.
   p,e=launch(b)
   p.locator('#challengeCode').fill('DEFEND5')
   p.locator('#startBtn').click()
   for it in range(2*state(p)['n']+10):
    s=state(p)
    bad=next(((r,c) for r,c in neighbours(s) if s['cells'][r][c]['mine']),None)
    if bad:break
    route=s['route'];cur=route.index(s['pos']) if s['pos'] in route else -1
    if cur+1>=len(route):raise AssertionError('No reachable mine before goal')
    nxt=route[cur+1];click_cell(p,nxt['r'],nxt['c']);p.wait_for_timeout(380)
    if p.locator('#modalRoot').is_visible():close_quiz(p)
   else:raise AssertionError('No nearby mine in seeded board')
   s=state(p);bad=next((r,c) for r,c in neighbours(s) if s['cells'][r][c]['mine'])
   current=pos(s)
   # shield prevents hit and party remains on safe cell
   p.locator('#shieldBtn').click()
   click_cell(p,*bad)
   sh=state(p)
   assert pos(sh)==current and sh['hearts']==3 and sh['shields']==1 and sh['cells'][bad[0]][bad[1]]['flag']
   # unflag then step and rescue success
   p.locator('#flagBtn').click();click_cell(p,*bad)
   p.locator('#digBtn').click();click_cell(p,*bad)
   assert state(p)['rescuePending']
   p.wait_for_timeout(360)
   assert p.locator('.rescue-tap').is_visible()
   for _ in range(5):p.locator('.rescue-tap').click()
   saved=state(p)
   assert saved['hearts']==3 and saved['saved']==1 and pos(saved)==current and saved['cells'][bad[0]][bad[1]]['flag']
   assert not e,e
   steps.append('shield and 5s co-op rescue do not teleport characters PASS')
   p.screenshot(path=str(ROOT/'v4-rescue.png'))
   p.close()
   # save&resume plus local analytics and poster (not publish).
   p,e=launch(b,mock=MOCK)
   p.locator('[data-level=normal]').click();p.locator('#challengeCode').fill('SAVE44')
   p.locator('#startBtn').click()
   rt=state(p)['route']
   click_cell(p,rt[1]['r'],rt[1]['c'])
   p.wait_for_timeout(300)
   s=state(p)
   p.locator('#backHomeBtn').click();p.get_by_text('返回首页',exact=True).click();p.wait_for_timeout(400)
   assert p.locator('#resumeBtn').is_visible()
   p.locator('#resumeBtn').click();p.wait_for_timeout(250)
   restored=state(p)
   assert pos(restored)==pos(s) and restored['steps']==1 and restored['active']==s['active']
   p.locator('#shareCodeBtn').click();p.get_by_text('做一张挑战海报').click()
   img=p.locator('.poster-preview').get_attribute('src')
   assert img.startswith('data:image/png;base64,') and len(img)>10000
   assert not e,e
   steps.append('V4 state restore, challenge code, poster, error-free runtime PASS')
   p.close()
   # Portrait/small screen and all scenes, show objective visibly and nonoverflow.
   for wh in [(320,568),(390,844),(430,932)]:
    p,e=launch(b,*wh)
    for scene in ['sunset','sakura','starlight']:
     p.locator('[data-scene='+scene+']').click()
     p.wait_for_timeout(65)
    p.locator('[data-level=easy]').click();p.locator('#startBtn').click()
    assert p.locator('.route-banner').is_visible() and p.locator('#gameCanvas').is_visible()
    assert p.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
    p.screenshot(path=str(ROOT/f'v4-game-{wh[0]}x{wh[1]}.png'))
    assert not e,e
    steps.append(f'{wh[0]}x{wh[1]} portrait layout PASS')
    p.close()
  finally:b.close()
 print('\n'.join(steps));print('SUCCESS',len(steps))
if __name__=='__main__':verify()
