import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {CLASS_LIBRARY} from "../src/engine/classes.ts";
import {PLAYER_CLASS_CHOICES} from "../src/engine/classCertification.ts";
import {readCampaignJson,parseCampaign} from "../src/engine/campaign.ts";
import {MASTERY_LIBRARY,MASTERY_SLOTS,gainClassExperience,
  classMastered,unlockedMasteries,applyEquippedMasteries}
  from "../src/engine/mastery.ts";

const actor=(b,id="a1")=>b.units.find(x=>x.id===id);
function finish(b){
  b.units.find(x=>x.id==="e6").hp=0;
  assert.equal(b.beginEnemyTurn(),false);
  assert.equal(b.campaignStage,"settlement");
}
test("C4 all sixteen selectable classes have unique real rewards and correct thresholds",()=>{
  const ids=new Set();
  for(const id of PLAYER_CLASS_CHOICES){
    const cls=CLASS_LIBRARY[id];
    assert.equal(cls.masteryThreshold,cls.tier==="intermediate"?120:80);
    assert.equal(cls.masteryRewardIds.length,1,id);
    const ability=cls.masteryRewardIds[0];
    assert.ok(Object.hasOwn(MASTERY_LIBRARY,ability),id);
    assert.ok(!ids.has(ability),"no duplicate mastery id");
    ids.add(ability);
    assert.ok(MASTERY_LIBRARY[ability].amount>0);
  }
  assert.equal(ids.size,16);
  assert.equal(MASTERY_SLOTS,2);
});

test("C3 job XP is per-class, capped, and gives one-time mastery unlock",()=>{
  const exp={};
  assert.deepEqual(gainClassExperience(exp,"sword",79),{gained:79,mastered:false});
  assert.equal(classMastered(exp,"sword"),false);
  assert.deepEqual(gainClassExperience(exp,"sword",10),{gained:1,mastered:true});
  assert.deepEqual(gainClassExperience(exp,"sword",10),{gained:0,mastered:false});
  assert.equal(exp.sword,80);
  assert.deepEqual(unlockedMasteries(exp),["swordFocus"]);
  gainClassExperience(exp,"duelist",100);
  assert.equal(classMastered(exp,"duelist"),false);
  assert.deepEqual(gainClassExperience(exp,"duelist",20),{gained:20,mastered:true});
  assert.equal(exp.duelist,120);
  assert.equal(exp.sword,80);
  assert.equal(unlockedMasteries(exp).includes("duelistTempo"),true);
  assert.deepEqual(gainClassExperience(exp,"duelist",0),{gained:0,mastered:false});
});

test("C3 committed attacks grant once per engagement, not again for follow-ups",()=>{
  const b=new Battle(),a=actor(b),e=actor(b,"e1");
  a.x=5;a.y=1;e.x=6;e.y=1;
  b.click(5,1);b.click(6,1);
  assert.equal(a.classExperience.sword,10);
  assert.equal(b.log.length,1);
  b.click(5,1);b.click(6,1);
  assert.equal(a.classExperience.sword,10,"spent actor cannot farm attacks");
});

test("C3 counter XP is five and only goes to a surviving participating ally",()=>{
  const b=new Battle(),a=actor(b),e=actor(b,"e1");
  // A seeded critical can KO a normal-HP ally before it counters.
  // Fix combatant survivability so this test specifically checks counter XP.
  a.maxHp=999;a.hp=999;e.maxHp=999;e.hp=999;
  e.x=2;e.y=5;
  // The archer initially at (2,6) is also adjacent and has less HP.
  // Move it away so the deterministic AI actually targets the intended ally.
  actor(b,"a3").x=9;actor(b,"a3").y=0;
  assert.equal(b.beginEnemyTurn(),true);
  const plan=b.planEnemyAction();
  assert.equal(plan.unitId,"e1");
  assert.equal(plan.targetId,a.id);
  assert.equal(b.commitEnemyAction(plan),true);
  assert.ok(b.lastCombatEvents.some(evt=>evt.fromId===a.id));
  assert.equal(a.classExperience.sword,5);
});

test("C3 waiting grants four only once per turn and never for tentative movement",()=>{
  const b=new Battle(),a=actor(b);
  b.click(1,5);b.click(2,5);
  assert.equal(a.classExperience.sword,undefined);
  assert.equal(b.cancelMove(),true);
  b.click(1,5);b.waitSelected();
  assert.equal(a.classExperience.sword,4);
  b.waitSelected();
  assert.equal(a.classExperience.sword,4);
});

test("C3 mastery is not auto-equipped; equipped bonus changes real combat stats",()=>{
  const b=new Battle(),a=actor(b);
  const baseline=b.combatStats(a);
  gainClassExperience(a.classExperience,"sword",80);
  assert.equal(b.combatStats(a).hit,baseline.hit,"unlock alone has no effect");
  assert.equal(b.toggleMastery(a.id,"swordFocus"),true);
  assert.equal(b.combatStats(a).hit,baseline.hit+5);
  assert.equal(b.toggleMastery(a.id,"swordFocus"),true);
  assert.equal(b.combatStats(a).hit,baseline.hit);

});

test("C3 two slots and cross-class equip persist without re-unlocking",()=>{
  const b=new Battle(),a=actor(b);
  gainClassExperience(a.classExperience,"sword",80);
  gainClassExperience(a.classExperience,"brawler",80);
  gainClassExperience(a.classExperience,"lancer",80);
  assert.equal(b.toggleMastery(a.id,"swordFocus"),true);
  assert.equal(b.toggleMastery(a.id,"brawlerStep"),true);
  assert.equal(b.toggleMastery(a.id,"lanceGuard"),false);
  assert.equal(a.equippedMasteries.length,2);
  assert.equal(b.changeClass(a.id,"brawler"),true);
  const stats=b.combatStats(a);
  const clone={...a,equippedMasteries:[]};
  assert.equal(stats.hit,b.combatStats(clone).hit+5);
  assert.equal(stats.avoid,b.combatStats(clone).avoid+5);
  assert.equal(b.toggleMastery(a.id,"brawlerStep"),true);
  assert.equal(b.toggleMastery(a.id,"lanceGuard"),true);
  assert.deepEqual(a.equippedMasteries,["swordFocus","lanceGuard"]);
});

test("C3 passives match their descriptions and alter only the declared field",()=>{
  const base={physicalAttack:10,magicalAttack:11,physicalProtection:4,
    attackSpeed:8,magicalProtection:3,hit:50,avoid:20,crit:4,critAvoid:7,range:"1"};
  for(const [id,skill] of Object.entries(MASTERY_LIBRARY)){
    const before={...base};
    const out=applyEquippedMasteries(base,[id]);
    if(skill.effect!=="conditional")assert.equal(out[skill.effect],base[skill.effect]+skill.amount);
    for(const key of Object.keys(base))
      if(key!==skill.effect)assert.equal(out[key],before[key]);
    assert.deepEqual(base,before);
  }
});

test("C3 career XP, inheritance and mastery loadout are durable across sortie and reload",()=>{
  const b=new Battle({campaign:true}),a=actor(b);
  gainClassExperience(a.classExperience,"sword",80);
  assert.equal(b.toggleMastery(a.id,"swordFocus"),true);
  assert.equal(b.changeClass(a.id,"brawler"),true);
  gainClassExperience(a.classExperience,"brawler",15);
  const save=b.campaignSnapshot();
  const restored=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(save))});
  assert.equal(actor(restored).classExperience.sword,80);
  assert.equal(actor(restored).classExperience.brawler,15);
  assert.deepEqual(actor(restored).equippedMasteries,["swordFocus"]);
  const baseline=restored.combatStats({...actor(restored),equippedMasteries:[]});
  assert.equal(restored.combatStats(actor(restored)).hit,baseline.hit+5);
  assert.equal(restored.beginSortie(),true);
  const soldier=actor(restored);
  const checkpoint=restored.campaignSnapshot();
  assert.equal(checkpoint.allies[0].classExperience.brawler,15);
  gainClassExperience(soldier.classExperience,"brawler",10);
  const rolledBack=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(restored.campaignSnapshot()))});
  assert.equal(actor(rolledBack).classExperience.brawler,15);
  finish(restored);
  assert.equal(restored.pendingSettlement.units[0].classExpGained,10);
  assert.equal(restored.returnToPreparation(),true);
  assert.equal(actor(restored).classExperience.brawler,25);
  assert.equal(restored.beginSortie(),true);
  assert.deepEqual(actor(restored).equippedMasteries,["swordFocus"]);
});

test("C3 old C2-1 save migrates missing job fields without dropping other progress",()=>{
  const b=new Battle({campaign:true});
  b.beginSortie();finish(b);
  const historical=structuredClone(b.campaignSnapshot());
  historical.allies.forEach(unit=>{delete unit.classExperience;delete unit.equippedMasteries;});
  historical.pendingSettlement.units.forEach(unit=>delete unit.classExpGained);
  const parsed=parseCampaign(historical);
  assert.ok(parsed);
  assert.deepEqual(parsed.allies[0].classExperience,{});
  assert.deepEqual(parsed.allies[0].equippedMasteries,[]);
  assert.equal(parsed.pendingSettlement.units[0].classExpGained,0);
  assert.deepEqual(parsed.funds,historical.funds);
  assert.equal(historical.allies[0].classExperience,undefined,"migration is read-only");
  const resume=new Battle({campaign:true,save:parsed});
  assert.equal(resume.campaignStage,"settlement");
  assert.equal(resume.returnToPreparation(),true);
});

test("C3 reject bad mastery XP, fake skill, duplicate slots and locked equips",()=>{
  const b=new Battle({campaign:true}),saved=b.campaignSnapshot();
  for(const mutate of [
    x=>{x.allies[0].classExperience.sword=81;},
    x=>{x.allies[0].classExperience.sword=-1;},
    x=>{x.allies[0].classExperience.sword=1.5;},
    x=>{x.allies[0].classExperience.fake=80;},
    x=>{x.allies[0].equippedMasteries=["swordFocus"];},
    x=>{x.allies[0].equippedMasteries=["unknown"];},
    x=>{x.allies[0].classExperience.sword=80;x.allies[0].equippedMasteries=["swordFocus","swordFocus"];},
    x=>{x.allies[0].classExperience.sword=80;x.allies[0].equippedMasteries=["swordFocus","brawlerStep"];},
  ]){const copy=structuredClone(saved);mutate(copy);assert.equal(parseCampaign(copy),null);}
});

test("C3 class and equipment UI reflects mastery progress, rewards and slots",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
  for(const id of ["class-preview-mastery","class-mastery-slots","class-mastery-equipment"])
    assert.ok(html.includes('id="'+id+'"'));
  assert.ok(main.includes('battle.toggleMastery(actor.id,id)'));
  assert.ok(main.includes('classMastered(actor.classExperience,id)'));
  assert.ok(main.includes('unit.classExpGained'));
});
