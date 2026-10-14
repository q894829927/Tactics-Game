import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {ALLY_IDS,readCampaignJson,CAMPAIGN_STORAGE_KEY,parseCampaign}
  from "../src/engine/campaign.ts";
import {WEAPON_LIBRARY} from "../src/engine/weapons.ts";

function camp(){return new Battle({campaign:true});}
function ally(b,id="a1"){return b.units.find(u=>u.id===id);}
function leader(b){return b.units.find(u=>u.id==="e6");}
function win(b){
  leader(b).hp=0;
  assert.equal(b.beginEnemyTurn(),false);
  assert.equal(b.result,"victory");
  assert.equal(b.campaignStage,"settlement");
}

test("C2-0 begins at separate preparation: combat actions are unavailable until sortie",()=>{
 const b=camp();
 assert.equal(b.campaignStage,"preparation");
 assert.equal(b.preparationOpen,true);
 const a=ally(b),before={x:a.x,y:a.y};
 b.click(a.x,a.y);b.click(a.x+1,a.y);b.endTurn();
 assert.deepEqual({x:a.x,y:a.y},before);
 assert.equal(b.round,1);assert.equal(b.selectedId,null);
 assert.equal(b.beginEnemyTurn(),false);
 assert.equal(b.beginSortie(),true);
 assert.equal(b.campaignStage,"battle");
 assert.equal(b.preparationOpen,false);
 assert.equal(b.beginSortie(),false);
 b.click(a.x,a.y);
 assert.equal(b.selectedId,a.id);
});

test("C2-0 profession, loadout and progression survive battle restart and next sortie",()=>{
 const b=camp(),a=ally(b);
 assert.equal(b.changeClass("a1","brawler"),true);
 assert.equal(a.classId,"brawler");
 assert.equal(a.inventory[a.equippedIndex],"training-gauntlet");
 a.stats.speed+=3;a.level+=2;a.exp=65;a.weaponExp.gauntlet=117;
 a.weaponInstances[0].durability=13;
 const progress=b.campaignSnapshot();
 assert.equal(progress.allies[0].level,a.level);
 assert.equal(b.beginSortie(),true);
 a.hp=0;a.weaponExp.gauntlet=123;a.stats.speed+=1;
 win(b);
 assert.equal(b.pendingSettlement.units[0].weaponExpGained,6);
 assert.equal(b.returnToPreparation(),true);
 const next=ally(b);
 assert.equal(next.hp,next.maxHp,"KO unit heals before later sorties");
 assert.equal(next.classId,"brawler");
 assert.equal(next.level,a.level);
 assert.equal(next.stats.speed,a.stats.speed);
 assert.equal(next.weaponExp.gauntlet,123);
 assert.deepEqual(next.classLicenses,["sword","brawler"]);
 assert.equal(next.weaponInstances[0].durability,13);
 assert.equal(b.sortiesCompleted,1);
 assert.equal(b.beginSortie(),true);
 assert.equal(b.sortiesCompleted,1);
 assert.equal(b.units.find(u=>u.id==="e1").hp>0,true);
});

test("C2-0 per-sortie magic replenishes only on sortie, physical durability persists",()=>{
 const b=camp(),a=ally(b,"a4");
 a.spellCharges["fire-tome"]=0;
 const initial=ally(b,"a1").weaponInstances[0].durability;
 ally(b,"a1").weaponInstances[0].durability=5;
 assert.equal(b.beginSortie(),true);
 assert.equal(a.spellCharges["fire-tome"],WEAPON_LIBRARY["fire-tome"].maxCharges);
 a.spellCharges["fire-tome"]=1;
 win(b);
 assert.equal(b.returnToPreparation(),true);
 assert.equal(ally(b,"a4").spellCharges["fire-tome"],1,
  "remaining charges are visible in preparation and not silently refilled");
 assert.equal(ally(b,"a1").weaponInstances[0].durability,5);
 assert.equal(b.beginSortie(),true);
 assert.equal(ally(b,"a4").spellCharges["fire-tome"],8);
 assert.equal(ally(b,"a1").weaponInstances[0].durability,5);
 assert.notEqual(initial,5);
});

test("C2-0 reloading post-battle settlement restores the outcome and allows continuing",()=>{
 const b=camp(),a=ally(b);
 a.weaponExp.sword+=17;
 b.beginSortie();
 a.weaponExp.sword+=22;
 win(b);
 const saved=b.campaignSnapshot();
 const serial=readCampaignJson(JSON.stringify(saved));
 assert.ok(serial);
 const resumed=new Battle({campaign:true,save:serial});
 assert.equal(resumed.campaignStage,"settlement");
 assert.equal(resumed.pendingSettlement.result,"victory");
 assert.equal(resumed.sortiesCompleted,1);
 assert.equal(resumed.returnToPreparation(),true);
 assert.equal(ally(resumed).weaponExp.sword,a.weaponExp.sword);
 assert.equal(resumed.beginSortie(),true);
 assert.equal(resumed.units.find(u=>u.id==="e6").hp>0,true);
 assert.equal(resumed.pendingSettlement,null);
});

test("C2-0 in-flight save rolls back to last preparation checkpoint",()=>{
 const b=camp();const before=ally(b).weaponExp.sword;
 b.beginSortie();
 ally(b).weaponExp.sword+=99;
 const saved=b.campaignSnapshot();
 const resumed=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(saved))});
 assert.equal(resumed.campaignStage,"preparation");
 assert.equal(ally(resumed).weaponExp.sword,before);
 assert.equal(resumed.round,1);
});

test("C2-0 ordinary restart preserves completed progress but abandons unfinished sortie",()=>{
 const b=camp(),a=ally(b);
 a.weaponExp.sword+=5;
 b.beginSortie();a.weaponExp.sword+=17;
 b.restart();
 assert.equal(b.campaignStage,"preparation");
 assert.equal(ally(b).weaponExp.sword,125);
 assert.equal(b.sortiesCompleted,0);
 assert.equal(b.beginSortie(),true);
 ally(b).weaponExp.sword+=9;win(b);b.returnToPreparation();
 b.beginSortie();
 ally(b).weaponExp.sword+=99;
 b.restart();
 assert.equal(b.sortiesCompleted,1);
 assert.equal(ally(b).weaponExp.sword,134);
});

test("C2-0 corrupt, old schema, foreign weapons and implausible values are rejected",()=>{
 const b=camp(),save=b.campaignSnapshot();
 assert.match(CAMPAIGN_STORAGE_KEY,/campaign/);
 assert.equal(readCampaignJson("{"),null);
 assert.equal(readCampaignJson("null"),null);
 assert.equal(parseCampaign({...save,schema:77}),null);
 assert.equal(parseCampaign({...save,allies:[]}),null);
 const mutated=structuredClone(save);
 mutated.allies[0].weaponExp.sword=-10;
 assert.equal(parseCampaign(mutated),null);
 mutated.allies[0].weaponExp.sword=120;
 mutated.allies[0].inventory[0]="invalid-weapon";
 assert.equal(parseCampaign(mutated),null);
 const bad=structuredClone(save);
 bad.allies[0].classLicenses=[];
 assert.equal(parseCampaign(bad),null);
 const duplicate=structuredClone(save);
 duplicate.allies[1].id="a1";
 assert.equal(parseCampaign(duplicate),null);
});

test("C2-0 serialized records are deep copies and never store battle flags",()=>{
 const b=camp(),a=ally(b);
 const saved=b.campaignSnapshot();
 const entry=saved.allies[0];
 assert.deepEqual(saved.allies.map(x=>x.id),[...ALLY_IDS]);
 assert.equal("x" in entry,false);
 assert.equal("hp" in entry,false);
 assert.equal("spent" in entry,false);
 assert.equal("enemyQueue" in saved,false);
 entry.stats.speed=999;
 entry.weaponExp.sword=0;
 assert.notEqual(a.stats.speed,999);
 assert.equal(a.weaponExp.sword,120);
 assert.equal(readCampaignJson(JSON.stringify(b.campaignSnapshot()))!==null,true);
});

test("C2-0 explicitly clearing campaign is separate from normal restart",()=>{
 const b=camp();
 ally(b).weaponExp.sword=300;
 b.resetCampaign();
 assert.equal(b.campaignStage,"preparation");
 assert.equal(ally(b).weaponExp.sword,120);
 assert.equal(b.sortiesCompleted,0);
 assert.equal(b.pendingSettlement,null);
});
