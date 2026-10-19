import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {CLASS_LIBRARY} from "../src/engine/classes.ts";
import {PLAYER_CLASS_CHOICES,classCertificationStatus} from "../src/engine/classCertification.ts";
import {MASTERY_LIBRARY,gainClassExperience,applyEquippedMasteries}
  from "../src/engine/mastery.ts";
import {terrainStepCost,innateHitBonus,innateDamageBonus}
  from "../src/engine/innateAbilities.ts";
import {classCombatTags} from "../src/engine/weaponTraits.ts";
import {weaponFor} from "../src/engine/weapons.ts";
import {applyStatus} from "../src/engine/statusEffects.ts";
import {parseCampaign,readCampaignJson} from "../src/engine/campaign.ts";
const u=(b,id)=>b.units.find(x=>x.id===id);
function opposite(){
 const b=new Battle(),a=u(b,"a1"),e=u(b,"e1");
 a.x=4;a.y=4;e.x=5;e.y=4;
 a.hp=a.maxHp=200;e.hp=e.maxHp=200;
 return {b,a,e};
}
test("C4 preserves seven basic and opens precisely nine intermediate classes",()=>{
 assert.equal(PLAYER_CLASS_CHOICES.length,16);
 const intermediate=PLAYER_CLASS_CHOICES.filter(x=>CLASS_LIBRARY[x].tier==="intermediate");
 assert.deepEqual(intermediate,["duelist","sentinel","formationBreaker","eliteMarksman",
  "martialArtist","arcanist","healer","roverCavalry","scout"]);
 for(const id of PLAYER_CLASS_CHOICES){
   assert.equal(CLASS_LIBRARY[id].innateAbilityIds.length,1,id);
   assert.equal(CLASS_LIBRARY[id].masteryRewardIds.length,1,id);
   assert.ok(MASTERY_LIBRARY[CLASS_LIBRARY[id].masteryRewardIds[0]],id);
 }
 for(const id of ["rider","flier","commander","raider"])
   assert.ok(!PLAYER_CLASS_CHOICES.includes(id));
});
test("C4 cavalry cannot certify before earned riding permit even with ample funds",()=>{
 const b=new Battle({campaign:true}),a=u(b,"a1");
 b.preparationFunds={reputation:40,gold:200,vouchers:{intermediate:1}};
 assert.equal(b.classStatus(a,"roverCavalry").eligible,false);
 assert.match(b.classStatus(a,"roverCavalry").reason,/骑乘许可/);
 assert.equal(b.changeClass(a.id,"roverCavalry"),false);
 assert.equal(a.classId,"sword");
 assert.equal(b.preparationFunds.gold,200);
});
test("C4 first victory awards a persistent mount permit, class switch does not keep cavalry tag",()=>{
 const b=new Battle({campaign:true}),a=u(b,"a1");
 assert.equal(b.beginSortie(),true);
 u(b,"e6").hp=0;
 assert.equal(b.beginEnemyTurn(),false);
 assert.equal(b.campaignStage,"settlement");
 assert.equal(b.ridingPermit,true);
 assert.equal(b.returnToPreparation(),true);
 const current=u(b,"a1"); // preparation has re-instantiated its roster
 assert.equal(b.classStatus(current,"roverCavalry").eligible,true);
 const old=current.move,oldS=structuredClone(current.stats),oldExp=structuredClone(current.weaponExp);
 assert.equal(b.changeClass(current.id,"roverCavalry"),true);
 assert.equal(b.effectiveMove(current),old+1);
 assert.equal(classCombatTags(current.classId).has("Cavalry"),true);
 assert.equal(b.preparationFunds.vouchers.intermediate,0);
 assert.equal(b.changeClass(current.id,"sword"),true);
 assert.equal(classCombatTags(current.classId).has("Cavalry"),false);
 assert.equal(b.effectiveMove(current),old);
 assert.deepEqual(current.stats,oldS);
 assert.deepEqual(current.weaponExp,oldExp);
 const saved=b.campaignSnapshot(),reloaded=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(saved))});
 assert.equal(reloaded.ridingPermit,true);
 assert.equal(u(reloaded,"a1").classLicenses.includes("roverCavalry"),true);
 const oldSave=structuredClone(saved);
 delete oldSave.ridingPermit;
 assert.equal(parseCampaign(oldSave).ridingPermit,true,"earned past victory migrates permit");
});
test("C4 scout needs sword D and bow E; cavalry needs sword D OR lance D",()=>{
 const b=new Battle(),a=u(b,"a1");
 b.preparationFunds={reputation:40,gold:200,vouchers:{intermediate:1}};
 assert.equal(b.classStatus(a,"scout").eligible,true);
 b.ridingPermit=true;
 assert.equal(b.classStatus(a,"roverCavalry").eligible,true);
 const xp={...a.weaponExp,sword:0,lance:40};
 const choice=classCertificationStatus("roverCavalry",xp,[],b.preparationFunds,true);
 assert.equal(choice.eligible,true);
 xp.lance=0;
 assert.equal(classCertificationStatus("roverCavalry",xp,[],b.preparationFunds,true).eligible,false);
 assert.equal(classCertificationStatus("scout",xp,[],b.preparationFunds,true).eligible,false);
});
test("C4 cavalry terrain costs and scout forest training affect shared path costs",()=>{
 const {b,a}=opposite();
 a.classId="roverCavalry";
 assert.equal(b.effectiveMove(a),a.move+1);
 assert.equal(terrainStepCost(a,"F",2),3);
 assert.equal(terrainStepCost(a,"H",2),3);
 assert.equal(terrainStepCost(a,"#",Infinity),Infinity);
 a.classId="scout";
 assert.equal(terrainStepCost(a,"F",2),2);
 a.equippedMasteries=["forestWalker"];
 assert.equal(terrainStepCost(a,"F",2),1);
 a.classId="sword";
 a.equippedMasteries=[];
 assert.equal(terrainStepCost(a,"F",2),2);
});
test("C4 lancer adjacency defense and brawler lone avoid only apply to current class",()=>{
 const b=new Battle(),a=u(b,"a1"),l=u(b,"a2"),arch=u(b,"a3");
 arch.x=9;arch.y=0;
 const beside=b.combatStats(l).physicalProtection;
 a.x=0;a.y=0;
 assert.equal(b.combatStats(l).physicalProtection,beside-1);
 const old=b.combatStats(a).avoid;
 a.classId="brawler";
 const lone=b.combatStats(a).avoid;
 assert.equal(lone,old+10,"brawler speed+1 contributes 2 avoid, solitude contributes 8");
});
test("C4 sentinel stationary melee reduction is after axe minimum, not a free damage floor bypass",()=>{
 const {b,e}=opposite();
 const d=u(b,"a2");d.classId="sentinel";d.x=4;d.y=5;
 e.x=5;e.y=5;
 const staticDamage=b.damage(e,d);
 d.moved=true;
 assert.equal(b.damage(e,d),staticDamage+2);
 e.x=6;e.y=5;d.moved=false;
 assert.equal(b.damage(e,d),staticDamage+2,"two tiles away loses flat reduction");
});
test("C4 high-defense hit bonuses and mage/arcanist debuff damage are conditional",()=>{
 const {a,e}=opposite();
 a.weapon.hit=45;e.stats.defense=8;
 a.classId="formationBreaker";
 assert.equal(innateHitBonus(a,e,true,true),10);
 a.classId="axeFighter";
 assert.equal(innateHitBonus(a,e,true,true),8);
 e.stats.defense=7;
 assert.equal(innateHitBonus(a,e,true,true),0);
 a.classId="mage";
 a.weapon=weaponFor("fire-tome");
 const baseline=innateDamageBonus(a,e,false);
 applyStatus(e,"slow",1,a.id);
 assert.equal(innateDamageBonus(a,e,false),baseline+1);
 a.classId="arcanist";
 assert.equal(innateDamageBonus(a,e,false),baseline+2);
});
test("C4 healer's active healing bonus is previewed, and invalid full-HP healing remains blocked",()=>{
 const {b,a}=opposite(),ally=u(b,"a2");
 ally.x=4;ally.y=5;ally.hp=ally.maxHp-20;
 a.classId="healer";a.weaponExp.white=40;
 a.inventory[0]="healing-prayer";a.weapon=weaponFor("healing-prayer");
 a.weaponInstances[0]=null;a.spellCharges["healing-prayer"]=6;
 const healer=b.previewSupport(a,ally,"heal");
 assert.ok(healer);
 a.classId="acolyte";
 const apprentice=b.previewSupport(a,ally,"heal");
 assert.equal(healer.value,apprentice.value,
   "healer bonus +3 offsets the acolyte's +1 magic and +2 prayer at this base magic");
 a.classId="healer";ally.hp=ally.maxHp;
 assert.equal(b.previewSupport(a,ally,"heal"),null);
});
test("C4 duelist marks only the attacked melee opponent and expires after turn transition",()=>{
 const {b,a,e}=opposite();
 a.classId="duelist";
 b.click(a.x,a.y);b.click(e.x,e.y);
 assert.equal(a.duelTargetId,e.id);
 const marked=b.hitChance(e,a);
 a.duelTargetId=null;
 assert.equal(b.hitChance(e,a),Math.min(100,marked+8));
});
test("C4 conditional mastery unlocked after job XP but not applied as constant stat",()=>{
 const {b,a,e}=opposite();
 const base=b.combatStats(a);
 gainClassExperience(a.classExperience,"formationBreaker",120);
 assert.equal(b.toggleMastery(a.id,"armorDrill"),true);
 assert.deepEqual(applyEquippedMasteries(base,["armorDrill"]),base);
 e.classId="sentinel";
 assert.equal(innateDamageBonus(a,e,true)-innateDamageBonus(a,e,false),1);
 assert.equal(b.toggleMastery(a.id,"armorDrill"),true);
 assert.equal(innateDamageBonus(a,e,true)-innateDamageBonus(a,e,false),0);
});
