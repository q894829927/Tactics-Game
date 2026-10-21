import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {CAREER_ARTS,careerArtForClass,isCareerArtId} from "../src/engine/careerArts.ts";
import {weaponFor} from "../src/engine/weapons.ts";
import {makeWeaponInstance} from "../src/engine/combatResources.ts";
import {statusPower} from "../src/engine/statusEffects.ts";
const unit=(b,id)=>b.units.find(x=>x.id===id);
const weaponIds={duelist:"iron-sword",sentinel:"iron-lance",
  formationBreaker:"iron-axe",eliteMarksman:"iron-bow",
  martialArtist:"training-gauntlet",arcanist:"fire-tome",
  healer:"healing-prayer",roverCavalry:"iron-lance",scout:"iron-bow"};
const point={duelist:1,sentinel:1,formationBreaker:1,eliteMarksman:2,
  martialArtist:1,arcanist:1,healer:1,roverCavalry:1,scout:2};
function setup(cls){
 const battle=new Battle(),actor=unit(battle,"a1"),target=unit(battle,"e1");
 actor.x=4;actor.y=4;target.x=4+point[cls];target.y=4;
 actor.classId=cls;actor.role=cls;actor.classLicenses.push(cls);
 const wid=weaponIds[cls];actor.inventory[0]=wid;actor.equippedIndex=0;
 actor.weapon=weaponFor(wid);
 actor.weaponInstances[0]=makeWeaponInstance(actor.characterId,0,wid);
 actor.spellCharges[wid]=actor.weapon.maxCharges??0;
 actor.weaponExp[actor.weapon.category]=120;
 if(cls==="scout")actor.weaponExp.sword=120;
 actor.minRange=actor.weapon.minRange;actor.maxRange=actor.weapon.maxRange;
 actor.hp=actor.maxHp=150;target.hp=target.maxHp=150;
 // Critical RNG is immaterial for expected resource and status effects.
 actor.weapon.hit=1000;
 return {battle,actor,target,art:careerArtForClass(cls)};
}
test("C4-A exactly nine original intermediate classes have one stable job-only ID",()=>{
 const ids=Object.keys(CAREER_ARTS);
 assert.equal(ids.length,9);assert.equal(new Set(ids).size,9);
 for(const id of ids){
  const art=CAREER_ARTS[id];
  assert.equal(careerArtForClass(art.classId).id,id);
  assert.equal(isCareerArtId(id),true);
  assert.equal(art.cost>0,true);
 }
 assert.equal(isCareerArtId("forged"),false);
});
test("C4-A all eight strike skills preview without changing resources, HP or RNG state",()=>{
 for(const cls of Object.keys(weaponIds).filter(x=>x!=="healer")){
  const {battle,actor,target,art}=setup(cls);
  if(cls==="roverCavalry"){actor.moved=true;actor.movedTiles=3;}
  const snapshot=JSON.stringify({a:actor,e:target,log:battle.log});
  const preview=battle.previewAction(actor,target,art.id);
  assert.ok(preview,cls);
  assert.equal(preview.spec.actionId,art.id);
  assert.deepEqual(preview.spec.costs.map(c=>c.amount),[art.cost],cls);
  assert.equal(JSON.stringify({a:actor,e:target,log:battle.log}),snapshot,cls);
 }
});
test("C4-A all eight strike skills pay their entire cost once on confirm",()=>{
 for(const cls of Object.keys(weaponIds).filter(x=>x!=="healer")){
  const {battle,actor,target,art}=setup(cls);
  if(cls==="roverCavalry"){actor.moved=true;actor.movedTiles=3;}
  const magic=actor.weapon.kind==="magical";
  const wid=actor.inventory[0];
  const before=magic?actor.spellCharges[wid]:actor.weaponInstances[0].durability;
  battle.click(actor.x,actor.y);
  assert.equal(battle.useCombatArt(actor,target,art.id),true,cls);
  assert.equal(magic?actor.spellCharges[wid]:actor.weaponInstances[0].durability,
    before-art.cost,cls);
  assert.equal(actor.spent,true,cls);
  assert.equal(battle.lastActionEvents[0].actionId,art.id,cls);
  assert.ok(battle.lastCombatEvents.length>=1,cls);
 }
});
test("C4-A class switch, forgery, wrong weapon and insufficient costs cannot mutate battle",()=>{
 const {battle,actor,target,art}=setup("formationBreaker");
 const original=JSON.stringify({a:actor,e:target});
 assert.equal(battle.previewAction(actor,target,"forged"),null);
 assert.equal(JSON.stringify({a:actor,e:target}),original);
 actor.classId="sword";
 assert.equal(battle.previewAction(actor,target,art.id),null);
 actor.classId="formationBreaker";
 actor.classLicenses=["sword"];
 assert.equal(battle.previewAction(actor,target,art.id),null);
 actor.classLicenses.push("formationBreaker");
 actor.weaponInstances[0].durability=3;
 const before=JSON.stringify({a:actor,e:target});
 assert.equal(battle.previewAction(actor,target,art.id),null);
 battle.click(actor.x,actor.y);
 assert.equal(battle.useCombatArt(actor,target,art.id),false);
 assert.equal(JSON.stringify({a:actor,e:target}),before);
 actor.weaponInstances[0].durability=30;
 actor.weapon=weaponFor("iron-sword");
 assert.equal(battle.previewAction(actor,target,art.id),null);
});
test("C4-A class skills bypass two general-purpose art slots, not their own credentials",()=>{
 const {battle,actor,target,art}=setup("formationBreaker");
 actor.equippedArts=[];
 assert.ok(battle.previewAction(actor,target,art.id));
 actor.weaponExp.axe=0;
 assert.equal(battle.previewAction(actor,target,art.id),null);
});
test("C4-A class hit, damage and no-follow-up rules use real forecast",()=>{
 const duel=setup("duelist");
 const normal=duel.battle.forecastAttack(duel.actor,duel.target);
 const special=duel.battle.forecastAttack(duel.actor,duel.target,duel.art.id);
 assert.equal(special.attackerHit,Math.min(100,normal.attackerHit+10));
 const marks=setup("eliteMarksman");
 marks.actor.stats.speed=90;marks.target.stats.speed=0;
 const a=marks.battle.forecastAttack(marks.actor,marks.target);
 const b=marks.battle.forecastAttack(marks.actor,marks.target,marks.art.id);
 assert.equal(b.damage,a.damage+2);assert.equal(b.followUp,null);
 marks.actor.moved=true;
 assert.equal(marks.battle.previewAction(marks.actor,marks.target,marks.art.id),null);
 const ride=setup("roverCavalry");
 assert.equal(ride.battle.previewAction(ride.actor,ride.target,ride.art.id),null);
 ride.actor.moved=true;ride.actor.movedTiles=2;
 assert.equal(ride.battle.previewAction(ride.actor,ride.target,ride.art.id),null);
 ride.actor.movedTiles=3;
 assert.equal(ride.battle.forecastAttack(ride.actor,ride.target,ride.art.id).damage,
   ride.battle.forecastAttack(ride.actor,ride.target).damage+2);
});
test("C4-A five on-hit statuses have the correct kind and never land on a miss",()=>{
 for(const [cls,status] of [["sentinel","slow"],["formationBreaker","weakArmor"],
  ["martialArtist","meleeWeaken"],["arcanist","weakMagic"],["scout","mark"]]){
  const {battle,actor,target,art}=setup(cls);
  // Prevent counter from instantly consuming the melee-accuracy debuff.
  if(cls==="martialArtist")target.weapon={...target.weapon,minRange:2,maxRange:2};
  battle.click(actor.x,actor.y);
  assert.equal(battle.useCombatArt(actor,target,art.id),true,cls);
  assert.ok(statusPower(target,status)>0,cls+":"+status);
 }
 const {battle,actor,target,art}=setup("sentinel");
 actor.weapon.hit=-10000;actor.stats.dexterity=0;
 battle.click(actor.x,actor.y);
 assert.equal(battle.useCombatArt(actor,target,art.id),true);
 assert.equal(statusPower(target,"slow"),0,"miss should still cost resources but not inflict slow");
});
test("C4-A one-shot melee hit penalty affects only the next physical adjacent strike",()=>{
 const {battle,actor,target,art}=setup("martialArtist");
 target.weapon={...target.weapon,minRange:2,maxRange:2};
 battle.click(actor.x,actor.y);
 assert.equal(battle.useCombatArt(actor,target,art.id),true);
 assert.equal(statusPower(target,"meleeWeaken"),5);
 const victim=unit(battle,"a2");
 victim.x=5;victim.y=5;
 target.weapon={...target.weapon,minRange:1,maxRange:1};
 const degraded=battle.hitChance(target,victim);
 target.statuses=target.statuses.filter(s=>s.kind!=="meleeWeaken");
 assert.equal(battle.hitChance(target,victim),Math.min(100,degraded+5));
});
test("C4-A Life Gift has higher effective healing, cannot target full HP or enemy",()=>{
 const {battle,actor,target,art}=setup("healer");
 const friend=unit(battle,"a2");friend.x=4;friend.y=5;
 friend.hp=friend.maxHp-25;
 const ordinary=battle.previewSupport(actor,friend,"heal");
 const spec=battle.previewCareerSupport(actor,friend,art.id);
 assert.equal(spec.value,ordinary.value+4);
 assert.equal(spec.cost,2);
 assert.equal(battle.previewCareerSupport(actor,target,art.id),null);
 const before=actor.spellCharges["healing-prayer"];
 battle.click(actor.x,actor.y);
 assert.equal(battle.commitCareerSupport(actor,friend,art.id),true);
 assert.equal(actor.spellCharges["healing-prayer"],before-2);
 assert.equal(battle.lastActionEvents[0].actionId,art.id);
 const other=setup("healer");
 const full=unit(other.battle,"a2");full.x=4;full.y=5;
 assert.equal(other.battle.previewCareerSupport(other.actor,full,art.id),null);
 other.actor.spellCharges["healing-prayer"]=1;
 full.hp--;
 assert.equal(other.battle.previewCareerSupport(other.actor,full,art.id),null);
 const record=JSON.stringify({actor:other.actor,full});
 other.battle.click(other.actor.x,other.actor.y);
 assert.equal(other.battle.commitCareerSupport(other.actor,full,art.id),false);
 assert.equal(JSON.stringify({actor:other.actor,full}),record);
});
test("C4-A swallow retreat happens only on defeat and valid unoccupied step",()=>{
 const {battle,actor,target,art}=setup("duelist");
 target.hp=1;const initial={x:actor.x,y:actor.y};
 const forecast=battle.forecastAttack(actor,target,art.id);
 assert.deepEqual(forecast.retreatTo,{x:3,y:4});
 battle.click(actor.x,actor.y);
 assert.equal(battle.useCombatArt(actor,target,art.id),true);
 assert.deepEqual({x:actor.x,y:actor.y},forecast.retreatTo);
 const second=setup("duelist");
 second.target.hp=1;
 const occupied=unit(second.battle,"a2");occupied.x=3;occupied.y=4;
 assert.equal(second.battle.forecastAttack(second.actor,second.target,second.art.id).retreatTo,null);
 second.battle.click(second.actor.x,second.actor.y);
 assert.equal(second.battle.useCombatArt(second.actor,second.target,second.art.id),true);
 assert.deepEqual({x:second.actor.x,y:second.actor.y},initial);
 const third=setup("duelist");third.target.hp=third.target.maxHp;
 third.battle.click(third.actor.x,third.actor.y);
 third.battle.useCombatArt(third.actor,third.target,third.art.id);
 assert.equal(third.actor.x,initial.x,"no kill means no retreat");
});
test("C4-A short-punch forecast predicts reduced next-melee counter accuracy",()=>{
 const {battle,actor,target,art}=setup("martialArtist");
 const before=battle.forecastAttack(actor,target);
 const after=battle.forecastAttack(actor,target,art.id);
 assert.ok(before.canCounter);
 assert.equal(after.defenderHit,Math.max(0,before.defenderHit-5));
});
test("C4-A scouts must keep sword D along with bow E to perform their action",()=>{
 const {battle,actor,target,art}=setup("scout");
 actor.weaponExp.sword=0;
 assert.equal(battle.previewAction(actor,target,art.id),null);
 actor.weaponExp.sword=40;actor.weaponExp.bow=0;
 assert.ok(battle.previewAction(actor,target,art.id),
   "E is the starting bow rank (zero XP), not an earned D-rank threshold");
});
test("C4-A dedicated command and prognosis exist independently of seven-family arts",()=>{
 const ui=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 const flat=readFileSync(new URL("../src/scene/flatBattleCommands.ts",import.meta.url),"utf8");
 assert.match(flat,/label:"战技 · "\+career.name/);
 assert.match(flat,/availableCareerWeapons\(actor\)/);
 assert.match(ui,/previewCareerSupport/);
 assert.match(ui,/command.action==="career"/);
});
