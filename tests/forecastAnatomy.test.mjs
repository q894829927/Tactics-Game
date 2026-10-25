import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {combatPreviewView,forecastStrikeRows} from "../src/scene/combatPreviewView.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("index.html"),css=read("src/style.css"),board=read("src/scene/BoardView.ts");
function setup(){
 const b=new Battle(),a=b.units.find(u=>u.id==="a1"),d=b.units.find(u=>u.id==="e1");
 a.x=5;a.y=1;d.x=6;d.y=1;
 const f=b.forecastAttack(a,d);assert.ok(f);
 return {b,a,d,f};
}
test("Forecast layers keep original HP -> per-strike lines -> remaining HP",()=>{
 const current=html.indexOf('id="forecast-ally-hp-current"');
 const strikes=html.indexOf('id="forecast-strike-list"');
 const health=html.indexOf('class="forecast-health"');
 assert.ok(current>=0&&current<strikes&&strikes<health);
 assert.match(html,/id="forecast-enemy-hp-current"/);
 assert.match(css,/\.duel-v3 \.forecast-strike-entry \{/);
 assert.match(board,/list\.replaceChildren\(\)/);
});
test("Forecast is read-only and maintains independent existing HP fields",()=>{
 const {a,d,f}=setup();
 const before=[a.hp,d.hp];const v=combatPreviewView(a,d,f);
 assert.deepEqual(before,[a.hp,d.hp]);
 assert.equal(v.ally.hpAfter,f.attackerHpAfter);
 assert.equal(v.enemy.hpAfter,f.defenderHpAfter);
 assert.equal(v.ally.firstDamage,f.damage);
 assert.equal(v.enemy.firstDamage,f.canCounter?f.counterDamage:null);
});
test("First, counter, follow-up rows follow actual strike order and sides",()=>{
 const {a,d,f}=setup();
 const specimen={...f,damage:11,canCounter:true,counterDamage:3,followUp:"attacker",
  attackerHit:91,attackerCrit:13,defenderHit:58,defenderCrit:2,
  followUpHit:69,followUpCrit:7,followUpDamage:12};
 const got=forecastStrikeRows(a,specimen);
 assert.deepEqual(got,[
  {kind:"attack",from:"ally",hit:91,crit:13,damage:11},
  {kind:"counter",from:"enemy",hit:58,crit:2,damage:3},
  {kind:"follow-up",from:"ally",hit:69,crit:7,damage:12}
 ]);
 const enemyFirst=forecastStrikeRows(d,{...specimen,followUp:"defender"});
 assert.deepEqual(enemyFirst.map(x=>x.from),["enemy","ally","ally"]);
 assert.deepEqual(enemyFirst.map(x=>x.kind),["attack","counter","follow-up"]);
 const enemyAttacker=forecastStrikeRows(d,{...specimen,followUp:"attacker"});
 assert.deepEqual(enemyAttacker.map(x=>x.from),["enemy","ally","enemy"]);
});
test("No counter and no follow-up produce one entry, including zero-damage attacks",()=>{
 const {a,f}=setup();
 const first=forecastStrikeRows(a,{...f,canCounter:false,counterDamage:0,followUp:null,damage:0});
 assert.equal(first.length,1);
 assert.equal(first[0].damage,0);
 assert.equal(first[0].hit,f.attackerHit);
});
test("Real follow-up uses non-first-hit bonus odds rather than blindly reusing first",()=>{
 const {b,a,d}=setup();
 a.stats.speed=20;d.stats.speed=4;a.build=99;d.build=99;
 a.weapon.hit=55;
 const f=b.forecastAttack(a,d);
 assert.ok(f);assert.equal(f.followUp,"attacker");
 assert.equal(f.followUpHit,b.hitChance(a,d));
 assert.equal(f.followUpCrit,b.criticalChance(a,d));
 const rows=forecastStrikeRows(a,f);
 assert.equal(rows[rows.length-1].hit,f.followUpHit);
});
test("Support rendering always clears previous attack rows",()=>{
 assert.match(board,/rows\.replaceChildren\(\)/);
 assert.match(board,/elem\("forecast-enemy-hp"\)\.textContent=String\(after\)/);
 assert.match(board,/elem\("forecast-strike-list"\)/);
});
test("Each attack keeps crit, hit and damage in one side-by-side row",()=>{
 assert.match(board,/offence\.append\(odds,damage\)/);
 assert.match(board,/damage\.textContent=strike\.damage>0\?String\(strike\.damage\):""/);
 assert.match(css,/\.duel-v3 \.forecast-strike-entry\[data-attacker="ally"\] \.forecast-strike-damage \{grid-column:2;grid-row:1\}/);
 assert.match(css,/\.duel-v3 \.forecast-strike-entry\[data-attacker="enemy"\] \.forecast-strike-damage \{grid-column:1;grid-row:1\}/);
 assert.match(css,/\.duel-v3 \.forecast-strike-head-enemy > :first-child \{grid-column:2\}/);
});
