import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/order-dock.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const { orderDockBottom: bottom } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const obstacle = overrides => ({ left: 10, right: 380, height: 58, bottom: 8, position: 'fixed', display: 'grid', visibility: 'visible', pointerEvents: 'auto', ...overrides });
for (const [name, items, expected] of [
  ['no lower panel', [], 0],
  ['visible panel keeps 12px separation', [obstacle({})], 78],
  ['large translated panel uses actual height', [obstacle({ height: 112 })], 132],
  ['safe area already included in panel bottom', [obstacle({ bottom: 42 })], 112],
  ['multiple panels reserve the highest edge, not sum', [obstacle({}), obstacle({ bottom: 10, height: 95 })], 117],
  ['desktop display none does not reserve a lane', [obstacle({ display: 'none' })], 0],
  ['hidden panel', [obstacle({ visibility: 'hidden' })], 0],
  ['sliding-out noninteractive panel', [obstacle({ pointerEvents: 'none' })], 0],
  ['static flow content is not an obstruction', [obstacle({ position: 'static' })], 0],
  ['sticky content is not a bottom fixed dock', [obstacle({ position: 'sticky' })], 0],
  ['panel horizontally outside the cart', [obstacle({ left: 401, right: 500 })], 0],
  ['touching horizontal edges do not overlap', [obstacle({ right: 14 })], 0],
  ['fractional dimensions rounded safely', [obstacle({ height: 58.2, bottom: 8.3 })], 79],
  ['empty box', [obstacle({ height: 0 })], 0],
  ['unresolved bottom is not treated as zero', [obstacle({ bottom: NaN })], 0],
  ['invalid geometry ignored', [obstacle({ right: Infinity })], 0],
  ['negative inset reserves full panel height', [obstacle({ bottom: -8 })], 70]
]) test(name, () => assert.equal(bottom(14, 390, items), expected));
test('original fixed 14px bottom is a failing negative control', () => {
  const panel = obstacle({});
  const actualNeeded = panel.bottom + panel.height + 12;
  assert.ok(14 < actualNeeded);
  assert.ok(bottom(14, 390, [panel]) >= actualNeeded);
});
test('both entry points install the same controller', () => {
  for (const path of ['src/order-launcher.ts', 'src/order-shell.ts']) {
    const text = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.match(text, /import \{ installOrderDock \} from "\.\/order-dock\.js"/);
    assert.match(text, /installOrderDock\((link|bar)\)/);
  }
});
test('CSS consumes measured clearance and preserves modal hiding', () => {
  const css = readFileSync(new URL('../order-shell.css', import.meta.url), 'utf8');
  assert.match(css, /bottom:max\(14px,env\(safe-area-inset-bottom\),var\(--robys-order-obstruction,0px\)\)/);
  assert.match(css, /--robys-order-page-clearance/);
  assert.match(css, /\.menu-open,\.lightbox-open/);
});
