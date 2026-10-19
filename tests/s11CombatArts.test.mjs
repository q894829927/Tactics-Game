import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {COMBAT_ARTS,ART_SLOTS,unlockedCombatArts}
  from "../src/engine/combatArts.ts";
import {weaponFor} from "../src/engine/weapons.ts";
import {makeWeaponInstance} from "../src/engine/combatResources.ts";
import {statusPower} from "../src/engine/statusEffects.ts";
import {parseCampaign} from "../src/engine/campaign.ts";

function scenario(id="a1"){
 const b=new Battle(),a=b.units.find(u=>u.id===id),e=b.units.find(u=>u.id==="e1");
 a.x=4;a.y=4;e.x=5;e.y=4;
 a.hp=a.maxHp=100;e.hp=e.maxHp=100;
 return {b,a,e};
}
function equip(a,id,category,rankExp,artId){
 a.classId=category==="axe"?"axeFighter":category==="gauntlet"?"brawler":
   category==="dark"?"mage":category==="white"?"acolyte":a.classId;
 a.inventory[0]=id;a.equippedIndex=0;a.weapon=weaponFor(id);
 a.weaponInstances[0]=a.weapon.kind==="physical"?makeWeaponInstance(a.id,0,id):null;
 a.spellCharges[id]=a.weapon.maxCharges??0;
 a.weaponExp[category]=rankExp;
 a.equippedArts=[artId];
 a.minRange=a.weapon.minRange;a.maxRange=a.weapon.maxRange;
}
test("S1-1 stable catalog includes exactly seven rank-gated arts",()=>{
 assert.deepEqual(Object.values(COMBAT_ARTS).map(a=>a.category).sort(),
   ["sword","lance","axe","bow","gauntlet","dark","white"].sort());
 assert.equal(COMBAT_ARTS["corrosion-hex"].rank,"C");
 assert.equal(ART_SLOTS,2);
 const {a}=scenario();
 assert.deepEqual(unlockedCombatArts(a.weaponExp),["swift-blade"]);
});
test("S1-1 D-rank sword art: preview is pure; first hit -1, accuracy +10, exactly 3 durability",()=>{
 const {b,a,e}=scenario();
 const normal=b.forecastAttack(a,e);
 const before=a.weaponInstances[0].durability;
 const original=JSON.stringify({units:b.units,log:b.log});
 const p=b.previewAction(a,e,"swift-blade");
 assert.equal(p.spec.actionId,"swift-blade");
 assert.equal(p.forecast.damage,normal.damage-1);
 assert.equal(p.forecast.attackerHit,Math.min(100,normal.attackerHit+10));
 assert.equal(JSON.stringify({units:b.units,log:b.log}),original);
 b.click(a.x,a.y);
 assert.equal(b.useCombatArt(a,e,"swift-blade"),true);
 assert.equal(a.weaponInstances[0].durability,before-3);
 assert.equal(a.spent,true);
 assert.equal(b.lastActionEvents[0].actionId,"swift-blade");
});
test("S1-1 lance hit applies slow only on hit, without stacking",()=>{
 const {b,a,e}=scenario("a2");
 a.weapon.hit=1000;e.stats.speed=1;
 b.click(a.x,a.y);
 assert.equal(b.useCombatArt(a,e,"intercept-thrust"),true);
 assert.equal(statusPower(e,"slow"),1);
 assert.equal(e.statuses.filter(x=>x.kind==="slow").length,1);
});
test("S1-1 heavy armor axe strike consumes 4 durability and forbids follow-up",()=>{
 const {b,a,e}=scenario();
 equip(a,"iron-axe","axe",40,"armor-sunder");
 e.classId="sentinel";a.stats.speed=70;e.stats.speed=0;
 const p=b.forecastAttack(a,e,"armor-sunder");
 assert.ok(p);
 assert.equal(p.followUp,null);
 assert.equal(p.damage,b.damage(a,e)+2);
 const old=a.weaponInstances[0].durability;
 b.click(a.x,a.y);
 assert.equal(b.useCombatArt(a,e,"armor-sunder"),true);
 assert.equal(a.weaponInstances[0].durability,old-4);
 assert.equal(b.lastCombatEvents.filter(x=>x.fromId===a.id).length,1);
});
test("S1-1 archer steady-shot requires no confirmed movement and forbids follow-up",()=>{
 const {b,a,e}=scenario("a3");e.x=6;
 a.stats.speed=50;e.stats.speed=0;
 const p=b.forecastAttack(a,e,"steady-shot");
 assert.ok(p);assert.equal(p.followUp,null);
 assert.equal(p.attackerHit,Math.min(100,b.hitChance(a,e)+15));
 a.moved=true;
 assert.equal(b.forecastAttack(a,e,"steady-shot"),null);
 a.moved=false;
 assert.ok(b.forecastAttack(a,e,"steady-shot"));
});
test("S1-1 gauntlet applies evasion after strike; forged or wrong-weapon skills are rejected",()=>{
 const {b,a,e}=scenario();
 equip(a,"training-gauntlet","gauntlet",40,"feint-punch");
 assert.equal(b.previewAction(a,e,"feint-punch").spec.costs[0].amount,3);
 assert.equal(b.previewAction(a,e,"swift-blade"),null);
 b.click(a.x,a.y);
 assert.equal(b.useCombatArt(a,e,"invented"),false);
 assert.equal(b.useCombatArt(a,e,"feint-punch"),true);
 assert.equal(statusPower(a,"evasion"),10);
});
test("S1-1 black C hex has a total spell cost of 2, hit applies weak armor",()=>{
 const {b,a,e}=scenario("a4");
 a.weaponExp.dark=120;a.equippedArts=["corrosion-hex"];
 a.weapon.hit=1000;a.stats.speed=2;e.stats.speed=2;
 const p=b.previewAction(a,e,"corrosion-hex");
 assert.equal(p.spec.costs[0].kind,"spell");
 assert.equal(p.spec.costs[0].amount,2);
 const id=a.inventory[a.equippedIndex],old=a.spellCharges[id];
 b.click(a.x,a.y);
 assert.equal(b.useCombatArt(a,e,"corrosion-hex"),true);
 assert.equal(a.spellCharges[id],old-2);
 assert.equal(statusPower(e,"weakArmor"),2);
});
test("S1-1 white D ward requires equipped skill and friendly target, pays 2 once",()=>{
 const {b,a,e}=scenario();const friend=b.units.find(u=>u.id==="a2");
 friend.x=4;friend.y=5;
 equip(a,"healing-prayer","white",40,"ward-prayer");
 assert.equal(b.previewSupport(a,e,"wardArmor"),null);
 assert.equal(b.previewSupport(a,friend,"wardArmor").value,2);
 const before=b.combatStats(friend).physicalProtection;
 b.click(a.x,a.y);
 assert.equal(b.commitSupport(a,friend,"wardArmor"),true);
 assert.equal(a.spellCharges["healing-prayer"],4);
 assert.equal(statusPower(friend,"wardArmor"),2);
 assert.equal(b.combatStats(friend).physicalProtection,before+2);
 assert.equal(b.lastActionEvents[0].actionId,"ward-prayer");
});
test("S1-1 two active slots persist through legacy migration, reject forged or duplicate IDs",()=>{
 const b=new Battle({campaign:true});
 const original=b.campaignSnapshot();
 assert.deepEqual(original.allies.find(a=>a.id==="a1").equippedArts,["swift-blade"]);
 const old=structuredClone(original);
 for(const row of old.allies)delete row.equippedArts;
 const normalized=parseCampaign(old);
 assert.ok(normalized);
 assert.deepEqual(normalized.allies.find(a=>a.id==="a1").equippedArts,["swift-blade"]);
 const invalid=structuredClone(original);
 invalid.allies[0].equippedArts=["swift-blade","swift-blade"];
 assert.equal(parseCampaign(invalid),null);
 invalid.allies[0].equippedArts=["corrosion-hex"];
 assert.equal(parseCampaign(invalid),null);
});
test("S1-1 skill slot can be configured only before deployment, not during fight",()=>{
 const b=new Battle({campaign:true});
 const a=b.units.find(x=>x.id==="a1");
 assert.equal(b.toggleCombatArt("a1","swift-blade"),true);
 assert.deepEqual(a.equippedArts,[]);
 assert.equal(b.toggleCombatArt("a1","swift-blade"),true);
 assert.equal(b.toggleCombatArt("a1","corrosion-hex"),false);
 assert.equal(b.beginSortie(),true);
 assert.equal(b.toggleCombatArt("a1","swift-blade"),false);
});
test("S1-1 UI has visible two-slot loadout and formal art command, not only W2 sample",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 assert.match(html,/id="class-art-equipment"/);
 assert.match(html,/id="class-art-slots"/);
 assert.match(board,/availableFormalArtWeapons\(actor\)/);
 assert.match(board,/mode==="formal"/);
});

test("S1-1 W2 physical sample remains unavailable for magic despite formal C-rank hex",()=>{
 const {b,a,e}=scenario("a4");
 a.weaponExp.dark=120;a.equippedArts=["corrosion-hex"];
 assert.equal(b.previewAction(a,e,"w2-power-strike"),null);
 b.click(a.x,a.y);
 assert.equal(b.useCombatArt(a,e,"w2-power-strike"),false);
});
test("S1-1 feint counter-hit preview uses the same evasion effect as actual combat",()=>{
 const {b,a,e}=scenario();
 equip(a,"training-gauntlet","gauntlet",40,"feint-punch");
 const normal=b.forecastAttack(a,e),feint=b.forecastAttack(a,e,"feint-punch");
 assert.ok(normal&&feint);
 const clone={...a,statuses:[...a.statuses,{kind:"evasion",power:10,
   expiresAfter:2,sourceId:a.id}]};
 assert.equal(feint.defenderHit,b.hitChance(e,clone));
 assert.ok(feint.defenderHit<=normal.defenderHit);
});
