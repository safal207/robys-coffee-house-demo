"""Bounded candidate preparation. This helper is excluded from the integration tree."""
from pathlib import Path
import subprocess

expected = {
    'src/order-dock.ts': 'dfbf9fde6045e10f6b47607e4cecda61f3d9f578',
    'order-shell.css': '34f0f23c9ab38a9b56ca5a0449aa7e67ff0638d6',
    '.github/workflows/unified-order-regression.yml': '30a542b9e074af69608faabd9785ed32fc7c38d3',
}
for path, sha in expected.items():
    assert subprocess.check_output(['git', 'hash-object', path], text=True).strip() == sha, 'Source moved: ' + path
p = Path('src/order-dock.ts')
s = p.read_text()
old = "const properties = ['--robys-order-obstruction', '--robys-order-page-clearance'];"
assert s.count(old) == 1
s = s.replace(old, "const properties = ['--robys-order-obstruction', '--robys-order-page-clearance', '--robys-order-hero-clearance'];")
s = s.replace('    let lane = 0;', '    let lane = 0;\n    let heroLane = 0;')
old = '      const next = orderDockBottom(box.left, box.right, obstacles);'
assert s.count(old) == 1
s = s.replace(old, '''      // Reserve potential fixed toolbars for the hero even while they are
      // sliding out. Actual bar position still follows interactive blockers.
      // This prevents scroll/IntersectionObserver state from resizing the hero.
      heroLane = Math.max(heroLane, orderDockBottom(box.left, box.right,
        obstacles.map(item => ({ ...item, visibility: 'visible', pointerEvents: 'auto' }))));
''' + old)
old = '    set(properties[1], occupied);'
assert s.count(old) == 1
s = s.replace(old, old + '''
    const heroOccupied = Math.max(...heights.map(([bar, height]) =>
      Math.max(heroLane, Number.parseFloat(win!.getComputedStyle(bar).bottom) || 14) + height + 12));
    set(properties[2], heroOccupied);''')
p.write_text(s)
p = Path('order-shell.css')
s = p.read_text()
assert 'ORDER-HERO-CLEARANCE:START' not in s
s += '''
/* ORDER-HERO-CLEARANCE:START */
/* The hero needs its own clearance, including toolbars which can appear on
   scroll. The reserve is measured independently of their transient visibility. */
body.has-unified-order .hero-content{padding-bottom:max(58px,var(--robys-order-hero-clearance,calc(6rem + env(safe-area-inset-bottom,0px))))}
body.has-unified-order .hero-content>*{min-width:0;max-width:100%;overflow-wrap:anywhere}
/* ORDER-HERO-CLEARANCE:END */
'''
p.write_text(s)
p = Path('.github/workflows/unified-order-regression.yml')
s = p.read_text()
old = '      - name: Shared order and Smart Choice end-to-end\n'
assert s.count(old) == 1
s = s.replace(old, '''      - name: Hero actions remain reachable above the order entry
        env:
          HERO_RESULTS_DIR: .artifacts/unified-order/hero
        run: |
          HERO_RESULTS_DIR=.artifacts/unified-order/hero-negative node scripts/order-hero-regression.mjs --negative-control
          node scripts/order-hero-regression.mjs
''' + old)
p.write_text(s)
