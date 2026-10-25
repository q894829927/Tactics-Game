import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const board=read("src/scene/BoardView.ts"),css=read("src/style.css"),html=read("index.html");

test("Forecast has no extra resource or unable-counter prose",()=>{
 assert.doesNotMatch(board,/普通攻击 · 耐久不消耗|法术交战 · 次数 -1|无法反击|本次支援行动 · 无反击/);
 assert.match(board,/cost\.textContent="";\s*cost\.hidden=true/);
 assert.match(board,/elem\("forecast-action-cost"\)\.textContent="";\s*elem\("forecast-action-cost"\)\.hidden=true/);
 assert.match(board,/forecast\.canCounter\?"后攻":""/);
 assert.match(board,/if\(strike\.from==="ally"\)odds\.append\(crit,hit\)/);
 assert.match(board,/else odds\.append\(hit,crit\)/);
 assert.match(board,/damage\.hidden=strike\.damage<=0/);
});
test("Each strike owns its own hit, crit and damage rather than one combatant-wide row",()=>{
 assert.match(html,/id="forecast-strike-list"/);
 assert.doesNotMatch(html,/id="forecast-ally-odds"/);
 assert.doesNotMatch(html,/id="forecast-first-strike-row"/);
 assert.match(board,/this\.paintStrikeRows\(forecastStrikeRows\(attacker,forecast\)\)/);
 assert.match(board,/row\.dataset\.attacker=strike\.from/);
 assert.match(board,/row\.dataset\.kind=strike\.kind/);
 assert.match(css,/\.duel-v3 \.forecast-strike-entry \{/);
 assert.match(css,/\.duel-v3 \.forecast-strike-chances \{/);
 assert.match(css,/\.duel-v3 \.forecast-strike-damage \{/);
 assert.match(css,/@media\(max-width:540px\)/);
});
