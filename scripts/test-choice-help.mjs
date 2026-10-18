import assert from "node:assert/strict";
import test from "node:test";
import { canOfferChoiceHelp } from "../src/choice-help.js";

const ready = { seen: false, visible: true, elapsed: 35_000, idle: 8_000,
  editing: false, overlay: false, hasOrder: false, checking: false, width: 320, height: 568 };

test("choice help waits for both visible time and a pause in interaction", () => {
  assert.equal(canOfferChoiceHelp(ready), true);
  assert.equal(canOfferChoiceHelp({ ...ready, elapsed: 34_999 }), false);
  assert.equal(canOfferChoiceHelp({ ...ready, idle: 7_999 }), false);
});

test("choice help never interrupts editing, ordering, hidden pages or pending basket reads", () => {
  for (const flag of ["seen", "editing", "overlay", "hasOrder", "checking"]) {
    assert.equal(canOfferChoiceHelp({ ...ready, [flag]: true }), false, flag);
  }
  assert.equal(canOfferChoiceHelp({ ...ready, visible: false }), false);
});

test("choice help avoids short landscape screens without blocking small portrait phones", () => {
  assert.equal(canOfferChoiceHelp({ ...ready, width: 844, height: 390 }), false);
  assert.equal(canOfferChoiceHelp({ ...ready, width: 279 }), false);
  assert.equal(canOfferChoiceHelp({ ...ready, width: 280, height: 500 }), true);
});
