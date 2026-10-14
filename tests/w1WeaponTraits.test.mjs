import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {weaponFor,WEAPON_LIBRARY,canWield} from "../src/engine/weapons.ts";
import {classCombatTags,effectiveMight,defensiveAvoidBonus,strikeDamage,
  AXE_MINIMUM_DAMAGE,GAUNTLET_AVOID_BONUS} from "../src/engine/weaponTraits.ts";
import {combatPreviewView} from "../src/scene/combatPreviewView.ts";

function duel(weaponId="iron-sword",defenderId="e1",range=1) {
 const game=new Battle();
 const a=game.units.find(u=>u.id==="a1"),d=game.units.find(u=>u.id===defenderId);
 a.x=5;a.y=1;d.x=5+range;d.y=1;
 a.weapon=weaponFor(weaponId);
 for(const u of [a,d]){
   u.hp=150;u.maxHp=150;
   u.stats.speed=8;u.build=99;
   u.stats.dexterity=0;u.stats.luck=0;
   u.weapon.hit=1000;u.weapon.crit=0;
   u.stats.defense=0;u.stats.resistance=0;
 }
 return {game,a,d};
}
function commit(game,a,d) {
 game.click(a.x,a.y);
 game.click(d.x,d.y);
 return game.lastCombatEvents;
}
test("W1: active equipment catalog covers seven families, no weapon triangle",()=>{
 const categories=new Set(Object.values(WEAPON_LIBRARY).map(x=>x.category));
 assert.deepEqual([...categories].sort(),["sword","lance","axe","bow","gauntlet","dark","white"].sort());
 assert.equal(WEAPON_LIBRARY["training-gauntlet"].kind,"physical");
 assert.equal(WEAPON_LIBRARY["light-bolt"].kind,"magical");
 assert.equal(canWield("brawler","training-gauntlet"),true);
 assert.equal(canWield("acolyte","light-bolt"),true);
 assert.equal(canWield("sword","training-gauntlet"),false);
 assert.equal(canWield("mage","light-bolt"),false);
 const g=new Battle();
 assert.equal(g.units.length,10,"do not silently alter first map roster");
 assert.equal(g.alive("ally").length,4);
 assert.equal(g.alive("enemy").length,6);
 assert.ok(!g.units.some(u=>u.classId==="brawler"||u.classId==="acolyte"));
});

test("W1: cavalry/flier tags come from current class, not character identity",()=>{
 const {d}=duel("iron-lance");
 assert.equal(classCombatTags(d.classId).has("Cavalry"),false);
 d.classId="rider";
 assert.equal(classCombatTags(d.classId).has("Cavalry"),true);
 d.classId="flier";
 assert.equal(classCombatTags(d.classId).has("Flying"),true);
 assert.equal(classCombatTags(d.classId).has("Cavalry"),false);
});

test("W1: lance doubles weapon might only versus cavalry; preview and actual match",()=>{
 const {game,a,d}=duel("iron-lance");
 a.stats.strength=6;d.stats.defense=4;
 const normal=game.damage(a,d);
 d.classId="rider";
 const bonus=game.damage(a,d);
 assert.equal(normal,6+4-4);
 assert.equal(bonus,6+4*2-4);
 assert.equal(bonus-normal,4,"double weapon might not strength or final damage");
 const predicted=game.forecastAttack(a,d);
 assert.equal(predicted.damage,bonus);
 const events=commit(game,a,d);
 assert.equal(events[0].damage,bonus);
 assert.equal(game.damage(a,d),bonus);
});

test("W1: bow triples only weapon might versus flying; range and no counter remain",()=>{
 const {game,a,d}=duel("iron-bow","e1",2);
 a.stats.strength=5;d.stats.defense=3;
 const normal=game.damage(a,d);
 d.classId="flier";
 const special=game.damage(a,d);
 assert.equal(special,5+4*3-3);
 assert.equal(special-normal,8);
 assert.equal(game.forecastAttack(a,d).canCounter,false);
 assert.equal(commit(game,a,d)[0].damage,special);
 // Bow cannot counter at adjacent range regardless of movementMode tags.
 const defense=duel("iron-sword");
 defense.d.weapon=weaponFor("iron-bow");
 assert.equal(defense.game.inAttackRange(defense.d,defense.a),false);
});

test("W1: axe floors HIT damage to five, never guarantees an unmissable strike",()=>{
 const first=duel("iron-axe");
 first.a.stats.strength=1;first.a.weapon.might=0;first.d.stats.defense=99;
 assert.equal(first.game.damage(first.a,first.d),AXE_MINIMUM_DAMAGE);
 assert.equal(first.game.forecastAttack(first.a,first.d).damage,5);
 assert.equal(commit(first.game,first.a,first.d)[0].damage,5);
 const miss=duel("iron-axe");
 miss.a.stats.strength=1;miss.a.weapon.might=0;miss.d.stats.defense=99;
 miss.a.weapon.hit=0;
 assert.equal(commit(miss.game,miss.a,miss.d)[0].damage,0);
 assert.equal(miss.game.lastCombatEvents[0].missed,true);
 const crit=duel("iron-axe");
 crit.a.stats.strength=1;crit.a.weapon.might=0;crit.d.stats.defense=99;
 crit.a.weapon.crit=100;
 assert.equal(commit(crit.game,crit.a,crit.d)[0].damage,15);
 assert.equal(strikeDamage(0,"axe",true),15);
});

test("W1: gauntlet avoids non-gauntlet direct attacks, including magic",()=>{
 const {game,a,d}=duel("iron-sword");
 a.weapon.hit=75;
 d.weapon=weaponFor("training-gauntlet");
 d.weapon.weight=0;d.stats.speed=0;
 const sword=game.hitChance(a,d);
 d.weapon=weaponFor("iron-sword");
 const baseline=game.hitChance(a,d);
 assert.equal(sword,baseline-GAUNTLET_AVOID_BONUS);
 d.weapon=weaponFor("training-gauntlet");
 a.weapon=weaponFor("fire-tome");
 a.weapon.hit=75;
 assert.equal(game.hitChance(a,d),baseline-GAUNTLET_AVOID_BONUS);
 a.weapon=weaponFor("training-gauntlet");
 a.weapon.hit=75;
 assert.equal(game.hitChance(a,d),baseline);
 assert.equal(defensiveAvoidBonus("gauntlet","gauntlet"),0);
});

test("W1: attacking white magic uses magic/resistance and can follow up at AS difference 4",()=>{
 const {game,a,d}=duel("light-bolt");
 a.classId="acolyte";a.stats.magic=9;a.stats.strength=1;
 d.stats.resistance=2;d.stats.defense=20;
 a.stats.speed=12;d.stats.speed=8;
 assert.equal(game.damage(a,d),9+3-2);
 const predicted=game.forecastAttack(a,d);
 assert.equal(predicted.followUp,"attacker");
 assert.equal(predicted.damage,10);
 assert.equal(predicted.followUpDamage,10);
 const events=commit(game,a,d);
 assert.deepEqual(events.map(e=>e.kind),["attack","counter","follow-up"]);
 assert.equal(events[0].damage,10);
 assert.equal(events[2].damage,10);
});

test("W1: sword follow-up ×1.2 is only on extra hit; forecast, UI and actual match",()=>{
 const {game,a,d}=duel("iron-sword");
 a.stats.strength=6;a.weapon.might=4;d.stats.defense=0;
 a.stats.speed=12;d.stats.speed=8;
 const forecast=game.forecastAttack(a,d);
 assert.equal(forecast.damage,10);
 assert.equal(forecast.followUp,"attacker");
 assert.equal(forecast.followUpDamage,12);
 assert.equal(forecast.defenderHpAfter,d.hp-22);
 const view=combatPreviewView(a,d,forecast);
 assert.equal(view.ally.damageText,"10＋12");
 assert.match(view.ally.hitText,/剑追击伤害 ×1\.2/);
 const events=commit(game,a,d);
 assert.deepEqual(events.map(x=>x.kind),["attack","counter","follow-up"]);
 assert.equal(events[0].damage,10);
 assert.equal(events[2].damage,12);
 assert.equal(d.hp,forecast.defenderHpAfter);
});

test("W1: sword critical follow-up applies x3 before x1.2 with floor",()=>{
 const {game,a,d}=duel("iron-sword");
 a.stats.strength=7;a.weapon.might=4;d.stats.defense=0;
 a.stats.speed=12;d.stats.speed=8;
 a.weapon.crit=100;
 const events=commit(game,a,d);
 assert.equal(events[0].damage,33);
 assert.equal(events[2].damage,Math.floor(33*1.2));
 assert.equal(events[2].damage,39);
 assert.equal(strikeDamage(11,"sword",true,true),39);
});

test("W1: defender sword follow-up receives own bonus and uses its actual weapon",()=>{
 const {game,a,d}=duel("iron-axe");
 a.stats.speed=8;d.stats.speed=12;
 d.weapon=weaponFor("iron-sword");d.weapon.hit=1000;
 d.stats.strength=6;a.stats.defense=0;
 const preview=game.forecastAttack(a,d);
 assert.equal(preview.followUp,"defender");
 assert.equal(preview.counterDamage,10);
 assert.equal(preview.followUpDamage,12);
 const events=commit(game,a,d);
 assert.equal(events[1].kind,"counter");
 assert.equal(events[1].damage,10);
 assert.equal(events[2].kind,"follow-up");
 assert.equal(events[2].fromId,d.id);
 assert.equal(events[2].damage,12);
});

test("W1: dark magic uses magical defense and receives no sword-only damage bonus",()=>{
 const {game,a,d}=duel("fire-tome");
 a.stats.magic=9;a.stats.strength=50;
 d.stats.resistance=3;d.stats.defense=99;
 a.stats.speed=12;d.stats.speed=8;
 const preview=game.forecastAttack(a,d);
 assert.equal(preview.damage,10);
 assert.equal(preview.followUpDamage,10);
 assert.equal(preview.attackerTrait,"黑魔法 · 魔防结算");
 const events=commit(game,a,d);
 assert.equal(events[0].damage,10);
 assert.equal(events[2].damage,10);
});

test("W1: non-sword fast melee units follow up normally, preview stays read-only",()=>{
 for(const id of ["iron-lance","iron-axe","training-gauntlet"]){
   const {game,a,d}=duel(id);
   a.stats.speed=12;d.stats.speed=8;
   const snapshot=JSON.stringify(game.units),beforeLog=game.log.length;
   const forecast=game.forecastAttack(a,d);
   assert.equal(forecast.followUp,"attacker");
   assert.equal(forecast.followUpDamage,forecast.damage,id+" does not get sword bonus");
   assert.equal(JSON.stringify(game.units),snapshot);
   assert.equal(game.log.length,beforeLog);
   const events=commit(game,a,d);
   assert.equal(events[2].damage,events[0].damage);
 }
});

test("W1: tooltip labels do not mutate weapon definitions; resets restore unit classes",()=>{
 const {game,a,d}=duel("iron-lance");
 d.classId="rider";
 const before=JSON.stringify(WEAPON_LIBRARY);
 assert.match(game.forecastAttack(a,d).attackerTrait,/骑乘特效/);
 assert.equal(JSON.stringify(WEAPON_LIBRARY),before);
 game.restart();
 assert.equal(game.units.find(u=>u.id==="e1").classId,"raider");
});
