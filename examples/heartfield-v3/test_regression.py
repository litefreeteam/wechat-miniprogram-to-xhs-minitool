from pathlib import Path
from playwright.sync_api import sync_playwright
import time, traceback, json
ROOT=Path(__file__).parent
OUT=Path('/mnt/data')

def page_setup(browser,width=390,height=844,touch=True):
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=2,is_mobile=touch,has_touch=touch)
    errs=[]
    page.on('pageerror',lambda e: errs.append(str(e)))
    page.set_content((ROOT/'index.html').read_text())
    page.add_style_tag(content=(ROOT/'style.css').read_text())
    page.evaluate('window.__HEARTMINE_TEST__=true')
    page.add_script_tag(content=(ROOT/'xhs-adapter.js').read_text())
    page.add_script_tag(content=(ROOT/'game.js').read_text())
    page.wait_for_timeout(160)
    return page,errs

def state(p):return p.evaluate('window.__heartMineDebug.getState()')
def game_click(p,r,c):p.evaluate('([r,c])=>window.__heartMineDebug.hitCell(r,c,false)',[r,c])
def mouse_tile(p,r,c):
    xy=p.evaluate(f'window.__heartMineDebug.cellToScreen({r},{c})');box=p.locator('#gameCanvas').bounding_box()
    p.mouse.click(box['x']+xy['x'],box['y']+xy['y'])
def next_cell(s, f):
    return next(((r,c) for r,row in enumerate(s['cells']) for c,t in enumerate(row) if f(t)),None)
def vote_modal(p,options=(0,0)):
    for index in options:
        p.locator('.vote-option').nth(index).click()
    p.get_by_text('继续并肩探险').click()

def run():
    events=[]
    with sync_playwright() as play:
        b=play.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--no-proxy-server'])
        try:
            home,err=page_setup(b)
            assert home.locator('[data-scene]').count()==3
            home.screenshot(path=str(OUT/'heartfield-v2-home.png'),full_page=True)
            for theme,name in [('sunset','落日海岸'),('sakura','樱花公园'),('starlight','星河露营')]:
                home.locator('[data-scene="'+theme+'"]').click()
                assert name in home.locator('#heroSash').inner_text()
                home.wait_for_timeout(80)
                home.screenshot(path=str(OUT/f'heartfield-v2-{theme}-home.png'),full_page=False)
            assert not err,err
            events.append('主题选择与首页 3/3 PASS')
            home.close()

            for level,n,m in [('easy',6,6),('normal',7,10),('hard',8,15)]:
                p,errors=page_setup(b)
                p.locator('[data-level="'+level+'"]').click()
                p.locator('[data-scene="starlight"]').click()
                p.locator('#challengeCode').fill('LOVE68')
                p.locator('#startBtn').click()
                s=state(p)
                assert (s['n'],s['mines'],s['scene'])==(n,m,'starlight')
                assert p.locator('#scenePill').inner_text()=='✦ 星河露营'
                p.screenshot(path=str(OUT/f'heartfield-v2-{level}-game.png'),full_page=False)
                # Tap-safe and turns
                safe=next_cell(s,lambda t: not t['mine'] and not t['open'])
                mouse_tile(p,*safe)
                s2=state(p);assert s2['safeOpened']>s['safeOpened'] and s2['active']==1
                # Character emote
                p.locator('#encourageBtn').click();assert '鼓励' in p.locator('#messageTitle').inner_text()
                # No JS error
                assert not errors,errors
                events.append(f'{level} 扫雷核心/互动 PASS')
                p.close()

            # Shield + QTE success, QTE failure, game over, poster
            p,errors=page_setup(b)
            p.locator('#challengeCode').fill('SAVE77')
            p.locator('#startBtn').click()
            start=state(p)
            mine=next_cell(start,lambda t: t['mine'])
            # shield
            p.locator('#shieldBtn').click();game_click(p,*mine)
            sh=state(p);assert sh['hearts']==3 and sh['shields']==1 and sh['cells'][mine[0]][mine[1]]['flag']
            events.append('护盾救援 PASS')
            # QTE success
            target=next_cell(sh,lambda t:t['mine'] and not t['flag'])
            game_click(p,*target)
            pending=state(p);assert pending['rescuePending'] and pending['rescueCharges']==1
            p.wait_for_timeout(450)
            assert p.locator('#modalRoot').is_visible() and p.locator('.rescue-tap').is_visible()
            p.screenshot(path=str(OUT/'heartfield-v2-rescue.png'),full_page=False)
            for _ in range(5):p.locator('.rescue-tap').click()
            saved=state(p)
            assert saved['hearts']==3 and not saved['rescuePending'] and saved['saved']==1 and saved['cells'][target[0]][target[1]]['flag']
            events.append('5秒救援成功，生命不扣 PASS')
            # QTE fail via give-up
            target2=next_cell(saved,lambda t:t['mine'] and not t['flag'])
            game_click(p,*target2)
            p.wait_for_timeout(450)
            assert p.locator('.rescue-giveup').is_visible()
            p.locator('.rescue-giveup').click()
            failed=state(p)
            assert failed['hearts']==2 and failed['rescueCharges']==0 and not failed['rescuePending']
            events.append('救援失败扣血/返回控制 PASS')
            # remaining mines kill
            for _ in range(2):
                nextmine=next_cell(state(p),lambda t:t['mine'] and not t['flag'] and not t['open'])
                game_click(p,*nextmine)
            p.wait_for_timeout(500)
            dead=state(p)
            assert dead['hearts']==0 and dead['finished'] and not dead['won']
            assert p.locator('#modalRoot').is_visible()
            p.get_by_text('生成情侣战报',exact=False).click()
            src=p.locator('.poster-preview').get_attribute('src')
            assert src.startswith('data:image/png;base64,') and len(src)>5000
            p.screenshot(path=str(OUT/'heartfield-v2-end.png'),full_page=False)
            assert not errors,errors
            events.append('失败结算、战报海报/无报错 PASS')
            p.close()

            # Couple quiz correct and incorrect, comeback to game, victory
            p,errors=page_setup(b)
            p.locator('[data-scene="sakura"]').click()
            p.locator('#startBtn').click()
            for i in range(150):
                s=state(p)
                if s['finished']:break
                if p.locator('#modalRoot').is_visible():
                    kind=p.locator('#modalRoot').get_attribute('data-kind')
                    if kind=='quiz':
                        vote_modal(p, (0,0) if s['quizTotal']==0 else (0,1))
                    elif kind=='rescue':
                        for _ in range(5):p.locator('.rescue-tap').click()
                    else:
                        if p.locator('#modalButtons .primary').count():p.locator('#modalButtons .primary').first.click()
                    p.wait_for_timeout(20)
                    continue
                safe=next_cell(s,lambda t: not t['mine'] and not t['open'] and not t['flag'])
                if safe:game_click(p,*safe)
                p.wait_for_timeout(40)
            p.wait_for_timeout(520)
            won=state(p)
            print('win state', {k:won[k] for k in ['won','finished','quizTotal','quizMatched','storyStage','safeOpened']})
            assert won['won'] and won['finished'] and won['storyStage']==3 and won['quizTotal']>=1,won
            assert not errors,errors
            events.append('心愿格默契双选+剧情阶段+通关 PASS')
            p.close()

            # Solo has non-split quiz, long-press mobile functionality
            p,errors=page_setup(b,width=360,height=780)
            p.locator('[data-mode="solo"]').click();p.locator('#startBtn').click()
            s=state(p);assert s['rescueCharges']==1
            unopened=next_cell(s,lambda t:not t['open'])
            pos=p.evaluate(f'window.__heartMineDebug.cellToScreen({unopened[0]},{unopened[1]})');box=p.locator('#gameCanvas').bounding_box()
            x,y=box['x']+pos['x'],box['y']+pos['y']
            p.dispatch_event('#gameCanvas','pointerdown',{'pointerId':5,'pointerType':'touch','clientX':x,'clientY':y,'button':0,'isPrimary':True})
            p.wait_for_timeout(560)
            p.dispatch_event('#gameCanvas','pointerup',{'pointerId':5,'pointerType':'touch','clientX':x,'clientY':y,'button':0,'isPrimary':True})
            assert state(p)['cells'][unopened[0]][unopened[1]]['flag']
            assert not errors,errors
            events.append('单人模式/长按插旗 PASS')
            p.close()
        finally:
            b.close()
    print('\n'.join(events));print('ALL PASS',len(events))
if __name__=='__main__':run()