"""Property tests for seeded corridors, eight-neighbor numeric clues and reproducibility."""
from playwright.sync_api import sync_playwright
from test_escape import launch, state
import json

def main():
    total=0
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        try:
            p,errors=launch(browser)
            for level,n,expected_mines in [('easy',6,6),('normal',7,10),('hard',8,15)]:
                p.evaluate('level=>document.querySelector(`[data-level="${level}"]`).click()',level)
                for seed in range(120):
                    code=f'T{seed:05d}'
                    p.evaluate('(code)=>document.getElementById("challengeCode").value=code',code)
                    p.evaluate('window.__heartMineDebug.startGame()')
                    s=state(p)
                    cells=s['cells'];route=s['route'];mines=sum(int(t['mine']) for row in cells for t in row)
                    assert mines==expected_mines,(level,code,mines)
                    assert (route[0]['r'],route[0]['c'])==(n-1,0) and (route[-1]['r'],route[-1]['c'])==(0,n-1)
                    assert len(route)==2*n-1
                    for i,t in enumerate(route):
                        assert not cells[t['r']][t['c']]['mine'],(level,code,t)
                        if i:assert abs(t['r']-route[i-1]['r'])+abs(t['c']-route[i-1]['c'])==1
                    assert cells[n-1][0]['open'] and cells[route[1]['r']][route[1]['c']]['open']
                    for r in range(n):
                        for c in range(n):
                            tile=cells[r][c]
                            if tile['mine']:continue
                            nearby=sum(1 for yy in range(max(0,r-1),min(n,r+2)) for xx in range(max(0,c-1),min(n,c+2)) if (yy,xx)!=(r,c) and cells[yy][xx]['mine'])
                            assert tile['num']==nearby,(level,code,r,c,nearby,tile['num'])
                    if seed in (0,61,119):
                        p.evaluate('window.__heartMineDebug.startGame()')
                        s2=state(p)
                        assert route==s2['route'] and [[t['mine'] for t in row] for row in cells]==[[t['mine'] for t in row] for row in s2['cells']]
                    total+=1
            assert not errors,errors
            print(f'PASS {total} boards: no blocked goals, every corridor connected, accurate 8-neighbor numbers, reproducible seeds')
            p.close()
        finally:browser.close()
if __name__=='__main__':main()
