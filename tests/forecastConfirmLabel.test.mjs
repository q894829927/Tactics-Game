import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("Forecast confirmation is always labelled 攻击 regardless of attack or support",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
  assert.match(html,/<button id="forecast-confirm"[^>]*>攻击<\/button>/);
  assert.match(board,/document\.getElementById\("forecast-confirm"\)!\.textContent="攻击";/);
  assert.match(board,/elem\("forecast-confirm"\)\.textContent="攻击";/);
  assert.doesNotMatch(board,/确认试验战技|"确认"\s*\+\s*(?:title|career\.name|art\.name)/);
  assert.match(board,/addEventListener\("click", \(\) => this\.confirmAttack\(\)\)/);
});
