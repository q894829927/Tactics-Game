import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {combatPreviewView} from "../src/scene/combatPreviewView.ts";

const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("index.html");
const board=read("src/scene/BoardView.ts");
const css=read("src/style.css");
function combat(){
 const b=new Battle();
 const ally=b.units.find(u=>u.id==="a1");
 const enemy=b.units.find(u=>u.id==="e1");
 ally.x=5;ally.y=1;enemy.x=6;enemy.y=1;
 const f=b.forecastAttack(ally,enemy);
 assert.ok(f);
 return {b,ally,enemy,f};
}
test("Forecast layers run in exact semantic order: current -> odds -> damage -> remaining",()=>{
 const current=html.indexOf('id="forecast-ally-hp-current"');
 const odds=html.indexOf('class="forecast-odds-row"');
 const strike=html.indexOf('id="forecast-first-strike-row"');
 const follow=html.indexOf('id="forecast-followup-row"');
 const health=html.indexOf('class="forecast-health"');
 assert.ok(current>=0&&current<odds&&odds<strike&&strike<follow&&follow<health);
 assert.match(html,/id="forecast-enemy-hp-current"/);
 assert.match(html,/id="forecast-ally-hp"/);
 assert.match(html,/id="forecast-enemy-hp"/);
 assert.match(html,/id="forecast-ally-bar"/);
 assert.match(html,/id="forecast-enemy-after"/);
 assert.match(css,/\.duel-v2 \.forecast-odds-row\{/);
 assert.match(css,/\.duel-v2 \.forecast-followup-row\{/);
});
test("Normal forecast exposes original and projected HP without mutating combatants",()=>{
 const {ally,enemy,f}=combat();
 const hp=[ally.hp,enemy.hp];
 const view=combatPreviewView(ally,enemy,f);
 assert.deepEqual([view.ally.unit.hp,view.enemy.unit.hp],hp);
 assert.equal(view.ally.hpAfter,f.attackerHpAfter);
 assert.equal(view.enemy.hpAfter,f.defenderHpAfter);
 assert.equal(view.ally.firstDamage,f.damage);
 assert.equal(view.enemy.firstDamage,f.canCounter?f.counterDamage:null);
 assert.match(view.ally.hitText,/命中 \d+% · 必杀 \d+%/);
 assert.deepEqual([ally.hp,enemy.hp],hp);
});
test("No counter does not render an incoming damage amount, either initiative",()=>{
 const {ally,enemy,f}=combat();
 const noCounter={...f,canCounter:false,counterDamage:0,followUp:null};
 const a=combatPreviewView(ally,enemy,noCounter);
 assert.equal(a.enemy.firstDamage,null);
 assert.equal(a.enemy.followUpDamage,null);
 assert.equal(a.enemy.damageText,"—");
 const b=combatPreviewView(enemy,ally,noCounter);
 assert.equal(b.ally.firstDamage,null);
 assert.equal(b.ally.followUpDamage,null);
});
test("Follow-up damage is independent and stays on the proper receiving side",()=>{
 const {ally,enemy,f}=combat();
 const attacker={...f,followUp:"attacker",followUpDamage:7};
 const a=combatPreviewView(ally,enemy,attacker);
 assert.equal(a.ally.firstDamage,f.damage);
 assert.equal(a.ally.followUpDamage,7);
 assert.equal(a.enemy.followUpDamage,null);
 const enemyFirst=combatPreviewView(enemy,ally,attacker);
 assert.equal(enemyFirst.enemy.firstDamage,f.damage);
 assert.equal(enemyFirst.enemy.followUpDamage,7);
 assert.equal(enemyFirst.ally.followUpDamage,null);
 const counter={...f,canCounter:true,followUp:"defender",followUpDamage:5};
 const b=combatPreviewView(ally,enemy,counter);
 assert.equal(b.enemy.followUpDamage,5);
 assert.equal(b.ally.followUpDamage,null);
});
test("Damage entries are on the RECEIVER side: ally's damage on enemy right",()=>{
 const leftCounter=html.indexOf('id="forecast-counter"');
 const rightAttack=html.indexOf('id="forecast-damage"');
 const leftEnemyFollow=html.indexOf('id="forecast-enemy-followup"');
 const rightAllyFollow=html.indexOf('id="forecast-ally-followup"');
 assert.ok(leftCounter>0&&leftCounter<rightAttack);
 assert.ok(leftEnemyFollow>0&&leftEnemyFollow<rightAllyFollow);
 assert.match(board,/first\("forecast-damage",view\.ally\.firstDamage\)/);
 assert.match(board,/first\("forecast-counter",view\.enemy\.firstDamage\)/);
 assert.match(board,/followUp\.hidden=/);
 assert.match(css,/\.duel-v2 \.forecast-strike\[hidden\]\{display:none!important\}/);
});
test("Support clears past attack-only lines and displays healing as a positive effect",()=>{
 assert.match(board,/elem\("forecast-strike-label"\)\.textContent=healing\?"治疗":"效果"/);
 assert.match(board,/elem\("forecast-followup-row"\)\.hidden=true/);
 assert.match(board,/elem\("forecast-counter"\)\.hidden=true/);
 assert.match(board,/elem\("forecast-ally-hp-current"\)\.textContent=String\(actor\.hp\)/);
 assert.match(board,/elem\("forecast-enemy-hp"\)\.textContent=String\(after\)/);
});
