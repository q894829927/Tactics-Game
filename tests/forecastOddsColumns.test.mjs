import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {forecastStrikeRows} from "../src/scene/combatPreviewView.ts";
import {Battle} from "../src/engine/battle.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html"),css=read("src/style.css"),board=read("src/scene/BoardView.ts");

test("One fixed heading row, numeric-only crit and hit cells under each heading",()=>{
 const i=html.indexOf('id="forecast-strike-head"');
 const j=html.indexOf('id="forecast-strike-list"');
 assert.ok(i>0&&i<j);
 assert.match(html,/id="forecast-strike-head-ally"[^>]*>\s*<span>必杀<\/span><span>命中<\/span>/);
 assert.match(html,/id="forecast-strike-head-enemy"[^>]*>\s*<span>命中<\/span><span>必杀<\/span>/);
 assert.match(board,/crit\.textContent=String\(strike\.crit\)/);
 assert.match(board,/hit\.textContent=strike\.hit\+"%"/);
 assert.doesNotMatch(board,/crit\.textContent="必杀 "|hit\.textContent="命中 "/);
 assert.match(board,/if\(strike\.from==="ally"\)odds\.append\(crit,hit\)/);
 assert.match(board,/else odds\.append\(hit,crit\)/);
});
test("Shared header and strike widths are aligned, and side-only headers hide correctly",()=>{
 assert.match(css,/--forecast-crit-column:/);
 assert.match(css,/--forecast-hit-column:/);
 assert.match(css,/--forecast-odds-gap:/);
 assert.match(css,/\.duel-v3 \.forecast-strike-head-side,\s*\.duel-v3 \.forecast-strike-chances \{/);
 assert.match(css,/\.duel-v3 \.forecast-strike-head-ally,/);
 assert.match(css,/\.duel-v3 \.forecast-strike-head-enemy,/);
 assert.match(board,/head\.hidden=rows\.length===0/);
 assert.match(board,/!rows\.some\(strike=>strike\.from==="ally"\)/);
 assert.match(board,/!rows\.some\(strike=>strike\.from==="enemy"\)/);
 assert.match(board,/elem\("forecast-strike-head"\)\.hidden=true/);
});
test("First vs follow-up odds use independent values without repeating titles",()=>{
 const b=new Battle();
 const ally=b.units.find(u=>u.id==="a1");
 const enemy=b.units.find(u=>u.id==="e1");
 ally.x=5;ally.y=1;enemy.x=6;enemy.y=1;
 const f=b.forecastAttack(ally,enemy);
 assert.ok(f);
 const rows=forecastStrikeRows(ally,{
   ...f,canCounter:false,followUp:"attacker",
   attackerHit:99,attackerCrit:30,followUpHit:100,followUpCrit:50,
   followUpDamage:8
 });
 assert.deepEqual(rows.map(x=>[x.crit,x.hit]),[[30,99],[50,100]]);
 assert.deepEqual(rows.map(x=>x.kind),["attack","follow-up"]);
});
