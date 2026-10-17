import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {CLASS_LIBRARY,effectiveClassStats,effectiveClassGrowths} from "../src/engine/classes.ts";
import {PLAYER_CLASS_CHOICES,classCertificationStatus,certificationRequirements}
  from "../src/engine/classCertification.ts";
import {WEAPON_LIBRARY,canWield,MAX_INVENTORY} from "../src/engine/weapons.ts";
import {awardExperience} from "../src/engine/attributes.ts";
import {createCharacter} from "../src/engine/characters.ts";

const units=()=>{const b=new Battle();return {b,a:b.units.find(x=>x.id==="a1"),
 mage:b.units.find(x=>x.id==="a4"),enemy:b.units.find(x=>x.id==="e1")};};

test("C1 exposes seven free basic choices plus two qualified intermediate choices",()=>{
 const {b,a}=units();
 assert.deepEqual(b.classChoices,[...PLAYER_CLASS_CHOICES]);
 assert.equal(b.classChoices.length,9);
 assert.ok(!b.classChoices.includes("rider"));
 assert.ok(!b.classChoices.includes("flier"));
 assert.ok(!b.classChoices.includes("commander"));
 assert.ok(!b.classChoices.includes("raider"));
 assert.equal(b.classStatus(a,"brawler").eligible,true);
 assert.equal(b.classStatus(a,"duelist").eligible,false);
 assert.equal(b.classStatus(a,"rider").eligible,false);
 assert.deepEqual(certificationRequirements("duelist"),
  {gold:150,reputation:30,voucher:"intermediate"});
 assert.equal(b.preparationOpen,true);
});

test("C1 free certification of brawler swaps class, issues one loaner, and keeps personal progression",()=>{
 const {b,a}=units();
 const personal={stats:{...a.stats},growths:{...a.growths},xp:{...a.weaponExp},
  level:a.level,exp:a.exp,hp:a.hp,maxHp:a.maxHp};
 const originalHit=b.combatStats(a).attackSpeed;
 assert.equal(b.changeClass(a.id,"brawler"),true);
 assert.equal(a.classId,"brawler");
 assert.equal(a.role,"brawler");
 assert.equal(a.weapon.category,"gauntlet");
 assert.equal(a.trainingSlot,3);
 assert.equal(a.inventory.length,4);
 assert.equal(a.inventory[3],"training-gauntlet");
 assert.equal(a.weaponInstances[3].durability,WEAPON_LIBRARY["training-gauntlet"].maxDurability);
 assert.equal(b.combatStats(a).attackSpeed,originalHit+1);
 assert.deepEqual(a.stats,personal.stats);
 assert.deepEqual(a.growths,personal.growths);
 assert.deepEqual(a.weaponExp,personal.xp);
 assert.deepEqual({level:a.level,exp:a.exp,hp:a.hp,maxHp:a.maxHp},
  {level:personal.level,exp:personal.exp,hp:personal.hp,maxHp:personal.maxHp});
 assert.deepEqual(a.classLicenses,["sword","brawler"]);
 assert.deepEqual(b.preparationFunds,{reputation:0,gold:0,vouchers:{intermediate:0}});
});

test("C1 repeatedly changing class cannot stack stat bonuses or duplicate licenses",()=>{
 const {b,a}=units();
 const baseSpeed=a.stats.speed;
 for(let i=0;i<12;i++){
   assert.equal(b.changeClass(a.id,"brawler"),true);
   assert.equal(effectiveClassStats(a.stats,a.classId).speed,baseSpeed+1);
   assert.equal(b.changeClass(a.id,"sword"),true);
   assert.equal(effectiveClassStats(a.stats,a.classId).speed,baseSpeed);
 }
 assert.equal(a.classLicenses.filter(id=>id==="brawler").length,1);
 assert.equal(a.classLicenses.filter(id=>id==="sword").length,1);
 assert.equal(a.stats.speed,baseSpeed);
 assert.equal(a.inventory.length,4,"only one training slot");
 assert.equal(a.trainingSlot,3);
 assert.equal(a.inventory[0],"iron-sword","owned weapons are never replaced");
 assert.equal(a.weaponInstances[0].durability,24);
});

test("C1 free class switching can traverse all seven weapon categories with a single loaner slot",()=>{
 const {b,a}=units();
 const targets=[
  ["lancer","lance"],["axeFighter","axe"],["archer","bow"],
  ["brawler","gauntlet"],["mage","dark"],["acolyte","white"],["sword","sword"]
 ];
 for(const [id,category] of targets){
   assert.equal(b.changeClass(a.id,id),true,id);
   assert.equal(a.weapon.category,category,id);
   assert.ok(canWield(a.classId,a.inventory[a.equippedIndex],a.weaponExp),id);
   assert.ok(a.inventory.length<=MAX_INVENTORY);
   assert.equal(a.trainingSlot,3);
   assert.equal(a.inventory[0],"iron-sword","never replace owned inventory");
 }
 assert.equal(a.inventory.length,4);
 assert.equal(a.classLicenses.length,7);
 assert.equal(a.weaponExp.sword,120);
 assert.equal(a.weaponExp.dark,0);
 assert.equal(a.spellCharges["fire-tome"],8);
 assert.equal(a.spellCharges["healing-prayer"],6);
});

test("C1 requires D weapon rank AND reputation/voucher/gold for intermediate certification",()=>{
 const {b,a,mage}=units();
 assert.equal(b.classStatus(a,"duelist").reason,"需要名声 30");
 assert.match(b.classStatus(mage,"duelist").reason,/熟练度 D/);
 const previous=JSON.stringify({unit:a,resources:b.preparationFunds});
 assert.equal(b.changeClass(a.id,"duelist"),false);
 assert.equal(JSON.stringify({unit:a,resources:b.preparationFunds}),previous);
 b.preparationFunds.reputation=30;
 assert.equal(b.classStatus(a,"duelist").reason,"需要中级考试凭证");
 b.preparationFunds.vouchers.intermediate=1;
 assert.equal(b.classStatus(a,"duelist").reason,"需要金币 150");
 b.preparationFunds.gold=150;
 assert.equal(b.classStatus(a,"duelist").eligible,true);
 assert.equal(b.changeClass(a.id,"duelist"),true);
 assert.equal(a.classId,"duelist");
 assert.equal(b.preparationFunds.gold,0);
 assert.equal(b.preparationFunds.vouchers.intermediate,0);
 assert.equal(b.preparationFunds.reputation,30);
 assert.equal(a.classLicenses.includes("duelist"),true);
 assert.equal(b.changeClass(a.id,"sword"),true);
 assert.equal(b.changeClass(a.id,"duelist"),true,"certified class is free to re-enter");
 assert.equal(b.preparationFunds.gold,0);
 assert.equal(b.preparationFunds.vouchers.intermediate,0);
 assert.equal(a.classLicenses.filter(x=>x==="duelist").length,1);
});

test("C1 a different character must independently certify even if roster has an unlocked class",()=>{
 const {b,a,mage}=units();
 b.preparationFunds.reputation=100;
 b.preparationFunds.gold=300;
 b.preparationFunds.vouchers.intermediate=2;
 assert.equal(b.changeClass(a.id,"duelist"),true);
 assert.equal(b.classStatus(mage,"duelist").eligible,false,"mage lacks D sword");
 mage.weaponExp.sword=40;
 assert.equal(b.classStatus(mage,"duelist").eligible,true);
 assert.equal(b.changeClass(mage.id,"duelist"),true);
 assert.equal(b.preparationFunds.gold,0);
 assert.equal(b.preparationFunds.vouchers.intermediate,0);
 assert.equal(a.classLicenses.includes("duelist"),true);
 assert.equal(mage.classLicenses.includes("duelist"),true);
});

test("C1 primary class attribute and growth modifiers affect combat and leveling, not personal stats",()=>{
 const {b,a}=units();
 const speed=a.stats.speed,baseGrowth=a.growths.speed,magic=a.stats.magic;
 assert.equal(b.changeClass(a.id,"brawler"),true);
 assert.equal(effectiveClassStats(a.stats,a.classId).speed,speed+1);
 assert.equal(effectiveClassGrowths(a.growths,a.classId).speed,baseGrowth+5);
 assert.equal(b.changeClass(a.id,"acolyte"),true);
 assert.equal(effectiveClassStats(a.stats,a.classId).magic,magic+1);
 assert.equal(effectiveClassGrowths(a.growths,a.classId).magic,a.growths.magic+5);
 assert.equal(a.stats.magic,magic);
 // Use a seeded deterministic growth sample that passes 5%, not 0%.
 a.growths.magic=0;a.exp=90;
 assert.equal(awardExperience(a,10,()=>0.01,
  effectiveClassGrowths(a.growths,a.classId)),1);
 assert.equal(a.stats.magic,magic+1,"growth is a single permanent level-up");
 assert.equal(b.changeClass(a.id,"sword"),true);
 assert.equal(a.stats.magic,magic+1,"no reclass stat loss, only class modifier removed");
 assert.equal(effectiveClassStats(a.stats,a.classId).magic,magic+1);
});

test("C1 battle damage and forecast use current class modifiers without mutating weapon traits",()=>{
 const {b,a,enemy}=units();
 a.x=5;a.y=1;enemy.x=6;enemy.y=1;
 const original=JSON.stringify(a.stats);
 const before=b.forecastAttack(a,enemy);
 assert.equal(b.changeClass(a.id,"axeFighter"),true);
 assert.equal(a.weapon.category,"axe");
 const effective=b.combatStats(a);
 assert.equal(effective.physicalAttack,a.stats.strength+1+WEAPON_LIBRARY["iron-axe"].might);
 assert.equal(JSON.stringify(a.stats),original);
 assert.equal(b.forecastAttack(a,enemy).damage,b.damage(a,enemy));
 assert.equal(b.changeClass(a.id,"sword"),true);
 assert.equal(b.forecastAttack(a,enemy).damage,before.damage);
});

test("C1 only player allies can reclass and training enemy rider/flier remain restricted",()=>{
 const {b,a,enemy}=units();
 assert.equal(b.changeClass(enemy.id,"brawler"),false);
 assert.equal(b.changeClass(a.id,"rider"),false);
 assert.equal(b.changeClass(a.id,"flier"),false);
 assert.equal(b.changeClass(a.id,"commander"),false);
 assert.equal(b.changeClass("nonexistent","brawler"),false);
 assert.equal(b.changeClass(a.id,"sword"),false);
 assert.equal(a.classLicenses.length,1);
});

test("C1 changes are rejected once any player confirms movement, attacks, waits or ends turn",()=>{
 {
  const {b,a}=units();
  b.click(a.x,a.y);
  b.click(a.x+1,a.y);
  assert.equal(b.preparationOpen,false);
  assert.equal(b.changeClass(a.id,"brawler"),false);
  b.cancelMove();
  assert.equal(b.changeClass(a.id,"brawler"),false);
 }
 {
  const {b,a}=units();
  b.click(a.x,a.y);b.waitSelected();
  assert.equal(b.preparationOpen,false);
  assert.equal(b.changeClass(a.id,"brawler"),false);
 }
 {
  const {b,a}=units();
  b.beginEnemyTurn();
  assert.equal(b.preparationOpen,false);
  assert.equal(b.changeClass(a.id,"brawler"),false);
 }
});

test("C1 switching is legal only on first round and never restores exhausted resources",()=>{
 const {b,a}=units();
 a.spellCharges["fire-tome"]=0;
 assert.equal(b.changeClass(a.id,"mage"),true);
 assert.equal(a.spellCharges["fire-tome"],0,"changing to a class must not restore used spells");
 assert.equal(b.changeClass(a.id,"acolyte"),true);
 assert.equal(b.changeClass(a.id,"mage"),true);
 assert.equal(a.spellCharges["fire-tome"],0);
 b.round=2;
 assert.equal(b.changeClass(a.id,"sword"),false);
});

test("C1 existing original roster stats and 4v6 map remain unchanged at restart",()=>{
 const {b,a}=units();
 const stats={...a.stats},speed=b.combatStats(a).attackSpeed;
 const growths={...a.growths};
 assert.equal(b.changeClass(a.id,"acolyte"),true);
 assert.equal(b.units.length,10);
 b.restart();
 const restarted=b.units.find(u=>u.id==="a1");
 assert.equal(restarted.classId,"sword");
 assert.equal(restarted.role,"sword");
 assert.deepEqual(restarted.stats,stats);
 assert.deepEqual(restarted.growths,growths);
 assert.equal(b.combatStats(restarted).attackSpeed,speed);
 assert.equal(b.alive("ally").length,4);
 assert.equal(b.alive("enemy").length,6);
 assert.equal(b.preparationOpen,true);
});

test("C1 UI exposes desktop and mobile usable modal and shows effective attributes",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
 for(const id of ["class-preparation-button","settings-preparation",
   "class-preparation-overlay","class-roster","class-options",
   "class-preparation-details","class-preparation-confirm"]){
   assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 assert.match(main,/battle\.changeClass\(actor\.id,preparationClassId\)/);
 assert.match(main,/effectiveClassStats\(selected\.stats,selected\.classId\)/);
 assert.match(main,/effectiveClassGrowths\(selected\.growths,selected\.classId\)/);
 assert.match(css,/class-preparation-overlay/);
 assert.match(css,/max-width:600px/);
});
