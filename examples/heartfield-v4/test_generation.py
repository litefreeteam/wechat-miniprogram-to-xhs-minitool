"""Validate many deterministic maps, guaranteed escape routes and numeric hints."""
from playwright.sync_api import sync_playwright
from test_escape import launch, state

def main():
    total = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        try:
            page, errors = launch(browser)
            for level, n, mine_count in [('easy',6,6), ('normal',7,10), ('hard',8,15)]:
                page.evaluate('(level)=>document.querySelector("[data-level="+level+"]").click()', level)
                for seed in range(120):
                    code = 'T%05d' % seed
                    page.evaluate('(code)=>document.getElementById("challengeCode").value=code', code)
                    page.evaluate('window.__heartMineDebug.startGame()')
                    s = state(page)
                    board, path = s['cells'], s['route']
                    assert sum(x['mine'] for row in board for x in row) == mine_count
                    assert len(path) == 2*n-1
                    assert path[0] == {'r':n-1,'c':0} and path[-1] == {'r':0,'c':n-1}
                    for i, pt in enumerate(path):
                        assert not board[pt['r']][pt['c']]['mine']
                        if i:
                            prev = path[i-1]
                            assert abs(pt['r']-prev['r'])+abs(pt['c']-prev['c']) == 1
                    assert board[n-1][0]['open']
                    assert board[path[1]['r']][path[1]['c']]['open']
                    for r in range(n):
                        for c in range(n):
                            tile = board[r][c]
                            if tile['mine']:
                                continue
                            adjacent = sum(board[yy][xx]['mine']
                                           for yy in range(max(0,r-1),min(n,r+2))
                                           for xx in range(max(0,c-1),min(n,c+2))
                                           if (yy,xx) != (r,c))
                            assert tile['num'] == adjacent
                    if seed in (0,61,119):
                        page.evaluate('window.__heartMineDebug.startGame()')
                        second = state(page)
                        assert path == second['route']
                        assert [[x['mine'] for x in row] for row in board] == [[x['mine'] for x in row] for row in second['cells']]
                    total += 1
            assert not errors, errors
            print("PASS: %d seeded maps, 8-neighbor clues, safe connected route" % total)
        finally:
            browser.close()

if __name__ == '__main__':
    main()
