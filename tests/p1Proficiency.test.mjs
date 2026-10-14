import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {CHARACTER_LIBRARY,createCharacter} from "../src/engine/characters.ts";
import {WEAPON_CATEGORIES,WEAPON_RANKS} from "../src/engine/equipmentTypes.ts";
import {WEAPON_LIBRARY,canWield} from "../src/engine/weapons.ts";
import {
  WEAPON_RANK_THRESHOLDS,MAX_WEAPON_EXP,emptyWeaponExperience,weaponRankForExp,
  meetsWeaponRank,awardWeaponExperience,weaponExperienceGain,weaponExperienceText
} from "../src/engine/proficiency.ts";
import {readFileSync} from "node:fs";

function duel(attackerId="a1",defenderId="e1",distance=1){
 const game=new Battle();
 const a=game.units.find(u=>u.id===attackerId);
 const d=game.units.find(u=>u.id===defenderId);
 a.x=5;a.y=1;d.x=5+distance;d.y=1;
 a.hp=a.maxHp=150;d.hp=d.maxHp=150;
 a.stats.luck=0;d.stats.luck=0;a.stats.dexterity=0;d.stats.dexterity=0;
 a.weapon.hit=1000;d.weapon.hit=1000;a.weapon.crit=0;d.weapon.crit=0;
 a.stats.speed=d.stats.speed=8;a.build=d.build=99;
 return {game,a,d};
}
function attack(game,a,d){
 game.click(a.x,a.y);game.click(d.x,d.y);
 return game.lastCombatEvents;
}

test("P1: seven independent accumulated XP fields, all E–S+ thresholds",()=>{
 const thresholds=[["E",0],["D",40],["C",120],["B",260],
  ["A",450],["S",700],["S+",1000]];
 assert.deepEqual(WEAPON_RANKS,thresholds.map(x=>x[0]));
 for(const [rank,threshold] of thresholds){
   assert.equal(WEAPON_RANK_THRESHOLDS[rank],threshold);
   assert.equal(weaponRankForExp(threshold),rank);
   assert.equal(meetsWeaponRank(threshold,rank),true);
   if(threshold>0)assert.equal(meetsWeaponRank(threshold-1,rank),false);
 }
 assert.equal(weaponRankForExp(-20),"E");
 assert.equal(weaponRankForExp(9e9),"S+");
 assert.equal(weaponRankForExp(Number.NaN),"E");
 const exp=emptyWeaponExperience();
 assert.deepEqual(Object.keys(exp),[...WEAPON_CATEGORIES]);
 assert.ok(Object.values(exp).every(x=>x===0));
});

test("P1: initial C proficiency is explicit for each legacy advanced weapon owner",()=>{
 const game=new Battle();
 for(const u of game.units){
   assert.equal(u.characterId,u.id);
   const maxRequired=u.inventory.reduce((acc,id)=>
     Math.max(acc,WEAPON_RANK_THRESHOLDS[WEAPON_LIBRARY[id].requiredRank]),0);
   const expected= u.classId==="mage"?0:120;
   assert.equal(maxRequired,expected,u.id);
   const category=WEAPON_LIBRARY[u.inventory[0]].category;
   assert.equal(u.weaponExp[category],expected,u.id);
   assert.equal(weaponRankForExp(u.weaponExp[category]),expected===0?"E":"C");
   assert.ok(u.inventory.every(id=>canWield(u.classId,id,u.weaponExp)));
   for(const other of WEAPON_CATEGORIES.filter(x=>x!==category))
     assert.equal(u.weaponExp[other],0,u.id+" -> "+other);
   assert.equal(CHARACTER_LIBRARY[u.id].startingClassId,u.classId);
 }
});

test("P1: no default/bypass when XP omitted; both class and rank must qualify",()=>{
 const xp=emptyWeaponExperience();
 assert.equal(canWield("sword","iron-sword",xp),true);
 assert.equal(canWield("sword","slim-sword",xp),false);
 assert.equal(canWield("sword","steel-sword",xp),false);
 assert.equal(canWield("lancer","iron-sword",xp),false);
 assert.equal(canWield("mage","light-bolt",xp),false);
 assert.equal(canWield("brawler","training-gauntlet",xp),true);
 assert.equal(canWield("acolyte","light-bolt",xp),true);
 assert.equal(canWield("sword","iron-sword"),false);
 xp.sword=39;
 assert.equal(canWield("sword","slim-sword",xp),false);
 xp.sword=40;
 assert.equal(canWield("sword","slim-sword",xp),true);
 xp.sword=119;
 assert.equal(canWield("sword","steel-sword",xp),false);
 xp.sword=120;
 assert.equal(canWield("sword","steel-sword",xp),true);
});

test("P1: equipment denied at low rank without spending action or changing weapon",()=>{
 const {game,a}=duel();
 game.click(a.x,a.y);
 a.weaponExp.sword=39;
 const previous={index:a.equippedIndex,name:a.weapon.name};
 assert.equal(game.equipWeapon(a,1),false);
 assert.equal(game.equipWeapon(a,2),false);
 assert.deepEqual({index:a.equippedIndex,name:a.weapon.name},previous);
 assert.equal(a.spent,false);assert.equal(a.acted,false);assert.equal(game.log.length,0);
 assert.equal(game.equipWeapon(a,0),true);
 a.weaponExp.sword=40;
 assert.equal(game.equipWeapon(a,2),true);
 assert.equal(game.equipWeapon(a,1),false);
 a.weaponExp.sword=120;
 assert.equal(game.equipWeapon(a,1),true);
});

test("P1: decreasing proficiency blocks a currently equipped illegal weapon",()=>{
 const {game,a,d}=duel();
 game.click(a.x,a.y);
 assert.equal(game.equipWeapon(a,1),true);
 assert.ok(game.forecastAttack(a,d));
 a.weaponExp.sword=0;
 assert.equal(game.forecastAttack(a,d),null);
 assert.equal(game.inAttackRange(a,d),false);
 assert.equal(game.equipWeapon(a,0),true);
 assert.ok(game.forecastAttack(a,d));
});

test("P1: different class type blocks current equipment even at high proficiency",()=>{
 const {game,a,d}=duel();
 a.weaponExp.sword=1000;
 a.classId="archer";
 assert.equal(game.forecastAttack(a,d),null);
 game.click(a.x,a.y);
 assert.equal(game.equipWeapon(a,0),false);
 assert.equal(game.log.length,0);
});

test("P1: proficiency XP bonuses ceil to 25% for current primary weapon",()=>{
 assert.equal(weaponExperienceGain("sword","sword",4),5);
 assert.equal(weaponExperienceGain("sword","sword",2),3);
 assert.equal(weaponExperienceGain("sword","sword",6),8);
 assert.equal(weaponExperienceGain("sword","lance",4),4);
 assert.equal(weaponExperienceGain("mage","dark",4),5);
 assert.equal(weaponExperienceGain("acolyte","white",4),5);
 assert.equal(weaponExperienceGain("archer","bow",0),0);
});

test("P1: XP awards clamp to S+ and cannot generate duplicate level rewards",()=>{
 const exp=emptyWeaponExperience();
 exp.sword=39;
 assert.deepEqual(awardWeaponExperience(exp,"sword","sword",4),{gained:5,from:"E",to:"D"});
 assert.equal(exp.sword,44);
 exp.sword=998;
 const max=awardWeaponExperience(exp,"sword","sword",6);
 assert.deepEqual(max,{gained:2,from:"S",to:"S+"});
 assert.equal(exp.sword,MAX_WEAPON_EXP);
 assert.equal(awardWeaponExperience(exp,"sword","sword",6).gained,0);
 assert.match(weaponExperienceText(exp,"sword"),/S\+.*MAX/);
});

test("P1: physical initial strike plus follow-up earns XP once, defender counter once",()=>{
 const {game,a,d}=duel();
 a.stats.speed=12;d.stats.speed=8;
 const beforeA=a.weaponExp.sword,beforeD=d.weaponExp.axe;
 const snapshot=JSON.stringify(game.units);
 assert.equal(game.forecastAttack(a,d).followUp,"attacker");
 assert.equal(JSON.stringify(game.units),snapshot);
 const events=attack(game,a,d);
 assert.deepEqual(events.map(x=>x.kind),["attack","counter","follow-up"]);
 assert.equal(a.weaponExp.sword,beforeA+5,"single active attack grant");
 assert.equal(d.weaponExp.axe,beforeD+3,"single defensive counter grant");
 assert.equal(a.weaponExp.axe,0);
 assert.equal(d.weaponExp.sword,0);
});

test("P1: defender follow-up also earns counter XP once, even after two strikes",()=>{
 const {game,a,d}=duel();
 a.stats.speed=8;d.stats.speed=12;
 const before=d.weaponExp.axe;
 const events=attack(game,a,d);
 assert.deepEqual(events.map(x=>x.kind),["attack","counter","follow-up"]);
 assert.equal(d.weaponExp.axe,before+3);
});

test("P1: killed defender never receives counter XP",()=>{
 const {game,a,d}=duel();
 d.hp=1;
 const before=d.weaponExp.axe;
 assert.deepEqual(attack(game,a,d).map(e=>e.kind),["attack"]);
 assert.equal(d.weaponExp.axe,before);
});

test("P1: missed legal physical attack grants XP and cancels no XP",()=>{
 const {game,a,d}=duel();
 a.weapon.hit=0;
 const initial=a.weaponExp.sword;
 game.click(a.x,a.y);
 game.forecastAttack(a,d);
 assert.equal(a.weaponExp.sword,initial);
 assert.equal(game.cancelMove(),false);
 game.click(d.x,d.y);
 assert.equal(game.lastCombatEvents[0].missed,true);
 assert.equal(a.weaponExp.sword,initial+5);
});

test("P1: committed physical combat art gives +6 base with class 25% bonus",()=>{
 const {game,a,d}=duel();
 const before=a.weaponExp.sword;
 game.click(a.x,a.y);
 assert.equal(game.useCombatArt(a,d,game.basicArt.id),true);
 assert.equal(a.weaponExp.sword,before+8);
 assert.equal(a.weaponInstances[0].durability,21);
});

test("P1: offensive black magic gains XP and consumes charges independently",()=>{
 const {game,a,d}=duel("a4","e1");
 a.stats.speed=12;d.stats.speed=8;
 const before=a.weaponExp.dark;
 assert.equal(before,0);
 const charges=a.spellCharges["fire-tome"];
 const events=attack(game,a,d);
 assert.equal(events.filter(e=>e.kind==="follow-up").length,1);
 assert.equal(a.weaponExp.dark,before+5);
 assert.equal(a.spellCharges["fire-tome"],charges-1);
 for(const key of ["white","sword","bow"])assert.equal(a.weaponExp[key],0);
});

test("P1: exhausted magic cannot grant XP, forecast or commit",()=>{
 const {game,a,d}=duel("a4","e1");
 a.spellCharges["fire-tome"]=0;
 const before=a.weaponExp.dark;
 assert.equal(game.forecastAttack(a,d),null);
 assert.deepEqual(attack(game,a,d),[]);
 assert.equal(a.weaponExp.dark,before);
});

test("P1: XP never transfers between different characters sharing personal template",()=>{
 const game=new Battle(),a=game.units.find(x=>x.id==="e1"),b=game.units.find(x=>x.id==="e4");
 const first=a.weaponExp.axe,second=b.weaponExp.axe;
 awardWeaponExperience(a.weaponExp,a.classId,"axe",4);
 assert.equal(a.weaponExp.axe,first+5);
 assert.equal(b.weaponExp.axe,second);
 assert.equal(createCharacter("e1").weaponExp.axe,first);
 game.restart();
 assert.equal(game.units.find(x=>x.id==="e1").weaponExp.axe,first);
});

test("P1: UI reports required rank and current rank, and blocks unauthorized choices",()=>{
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 const picker=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 assert.match(main,/weaponExperienceText\(selected\.weaponExp,weapon\.category\)/);
 assert.match(main,/canWield\(selected\.classId,id,selected\.weaponExp\)/);
 assert.match(picker,/weaponExperienceText\(actor\.weaponExp,item\.category\)/);
 assert.match(picker,/canWield\(actor\.classId,id,actor\.weaponExp\)/);
});
