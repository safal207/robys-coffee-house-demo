#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bootstrap = read("bootstrap.js");
const finalQa = read("final-qa.css");
const menuStability = read("menu-stability.css");
const discoverRotation = read("discover-rotation.css");
const menuHtml = read("menu.html");

assert.match(bootstrap, /installMobileNavigationAccessibility/);
assert.match(bootstrap, /event\.key === "Escape"/);
assert.match(bootstrap, /event\.key !== "Tab"/);
assert.match(bootstrap, /toggleAttribute\("inert"/);
assert.match(bootstrap, /navigationLinks\(\)\[0\]\?\.focus\(\)/);
assert.match(bootstrap, /restoreToggle: true/);

assert.match(finalQa, /\.lang-button\{min-width:44px;min-height:44px/);
assert.match(finalQa, /\.menu-toggle\{width:44px;height:44px\}/);

assert.match(menuStability, /\.menu-controls\{position:sticky;top:0;z-index:80/);
assert.match(menuStability, /\.menu-page \.lang-button\{min-width:44px;min-height:44px/);
assert.match(menuStability, /\.menu-category-chip\{min-height:44px\}/);
assert.match(menuStability, /\.menu-inline-link\{display:inline-flex;min-height:44px/);
assert.ok(menuHtml.indexOf("menu-stability.css") > menuHtml.indexOf("menu.css"), "menu usability overrides must load after menu.css");

assert.match(discoverRotation, /\.discover-header \.lang-button \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
assert.match(discoverRotation, /\.quiet-button,[\s\S]*?\.text-button \{[\s\S]*?min-height: 44px;/);

console.log("PASS: mobile usability navigation, sticky controls and touch-target contracts");
