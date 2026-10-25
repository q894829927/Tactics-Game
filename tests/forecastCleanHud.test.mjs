import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const board=read("src/scene/BoardView.ts");
const css=read("src/style.css");
const html=read("index.html");

test("Forecast has no cost tutorials or unable-to-counter prose",()=>{
  assert.doesNotMatch(board,/普通攻击 · 耐久不消耗|法术交战 · 次数 -1|无法反击|本次支援行动 · 无反击/);
  assert.match(board,/cost\.textContent="";\s*cost\.hidden=true/);
  assert.match(board,/elem\("forecast-action-cost"\)\.textContent="";\s*elem\("forecast-action-cost"\)\.hidden=true/);
  assert.match(board,/forecast\.canCounter\?"后攻":""/);
  assert.match(board,/attacker\.team==="enemy"\|\|forecast\.canCounter\?view\.enemy\.hitText:""/);
  assert.match(css,/\.duel-v3 \.forecast-initiative:empty/);
  assert.match(css,/\.duel-v3 \.forecast-odds:empty/);
});
test("Damage columns are tied to the same width and grid as current HP",()=>{
  assert.match(css,/--forecast-core-width: clamp\(150px, 18%, 255px\)/);
  assert.match(css,/grid-template-columns: minmax\(0, 1fr\) var\(--forecast-core-width\) minmax\(0, 1fr\)/);
  assert.match(css,/width: var\(--forecast-core-width\)/);
  assert.match(css,/\.duel-v3 #forecast-counter,\s*\.duel-v3 #forecast-enemy-followup \{ grid-column: 1; \}/);
  assert.match(css,/\.duel-v3 #forecast-damage,\s*\.duel-v3 #forecast-ally-followup \{ grid-column: 3; \}/);
  assert.match(css,/--forecast-core-width: 84px/);
  const left=html.indexOf('id="forecast-counter"'),right=html.indexOf('id="forecast-damage"');
  assert.ok(left>=0&&right>left);
});
