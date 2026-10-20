import test from "node:test";
import assert from "node:assert/strict";
import {Battle} from "../src/engine/battle.ts";
import {LEVELS,LEVEL_IDS,objectiveComplete} from "../src/engine/levels.ts";
import {readCampaignJson,parseCampaign} from "../src/engine/campaign.ts";
const camp=()=>new Battle({campaign:true});
function clear(b){
 const objective=b.currentLevel.victory;
 if(objective.kind==="defeat-unit")b.units.find(u=>u.id===objective.unitId).hp=0;
 else{const actor=b.units.find(u=>u.id==="a1");actor.x=objective.x;actor.y=objective.y;actor.spent=true;}
 assert.equal(b.beginEnemyTurn(),false);
 assert.equal(b.result,"victory");
}
function stage(b,id){assert.equal(b.returnToPreparation(),true);
 assert.equal(b.selectLevel(id),true);assert.equal(b.beginSortie(),true);}
test("C4-1B four distinct stages preserve first map and objective identities",()=>{
 assert.equal(LEVEL_IDS.length,4);
 assert.equal(LEVELS["chapter-1-1"].spawns[4].x,7);
 assert.equal(new Set(LEVEL_IDS.map(id=>LEVELS[id].terrain.join("|"))).size,4);
 for(const id of LEVEL_IDS){
   assert.equal(LEVELS[id].terrain.length,8);
   assert.ok(LEVELS[id].terrain.every(row=>row.length===10));
   assert.equal(LEVELS[id].prototype,false);
 }
 assert.equal(LEVELS["chapter-1-2"].victory.unitId,"e3");
 assert.equal(LEVELS["chapter-1-3"].victory.kind,"reach-tile");
 assert.equal(LEVELS["chapter-1-4"].victory.unitId,"e6");
});
test("C4-1B forest marksman holds position and defeating commander alone does not win",()=>{
 const b=camp();b.beginSortie();clear(b);stage(b,"chapter-1-2");
 const sniper=b.units.find(u=>u.id==="e3");
 assert.equal(sniper.classId,"eliteMarksman");assert.equal(sniper.holdPosition,true);
 b.units.find(u=>u.id==="e6").hp=0;
 assert.equal(b.beginEnemyTurn(),true);
 const plans=[];while(b.phase==="enemy"&&b.result==="playing"){
   const p=b.planEnemyAction();if(!p)break;
   if(p.unitId==="e3")plans.push(p);
   assert.equal(b.commitEnemyAction(p),true);
 }
 assert.equal(plans.length,1);assert.deepEqual(plans[0].destination,{x:8,y:1});
 b.finishEnemyTurn();
 sniper.hp=0;
 assert.equal(b.beginEnemyTurn(),false);
 assert.deepEqual(b.completedLevelIds,["chapter-1-1","chapter-1-2"]);
});
test("C4-1B mountain exit is reversible before confirmation and wins after wait",()=>{
 const b=camp();b.beginSortie();clear(b);stage(b,"chapter-1-2");clear(b);stage(b,"chapter-1-3");
 assert.equal(b.units.find(u=>u.id==="e2").classId,"roverCavalry");
 const a=b.units.find(u=>u.id==="a1");
 a.x=8;a.y=3;
 b.click(8,3);b.click(9,3);
 assert.equal(a.x,9);assert.equal(b.result,"playing");
 assert.equal(b.cancelMove(),true);assert.equal(a.x,8);
 b.click(8,3);b.click(9,3);b.waitSelected();
 assert.equal(b.result,"victory");
 assert.deepEqual(b.completedLevelIds,["chapter-1-1","chapter-1-2","chapter-1-3"]);
 assert.equal(b.pendingSettlement.reward.gold,200);
});
test("C4-1B exit rejects uncommitted, dead or enemy occupancy",()=>{
 const v=LEVELS["chapter-1-3"].victory;
 assert.equal(objectiveComplete(v,[{id:"a1",team:"ally",hp:10,spent:false,x:9,y:3}]),false);
 assert.equal(objectiveComplete(v,[{id:"a1",team:"ally",hp:0,spent:true,x:9,y:3}]),false);
 assert.equal(objectiveComplete(v,[{id:"e1",team:"enemy",hp:10,spent:true,x:9,y:3}]),false);
 assert.equal(objectiveComplete(v,[{id:"a3",team:"ally",hp:10,spent:true,x:9,y:3}]),true);
});
test("C4-1B fortress guards have distinct classes; other enemy kill not victory",()=>{
 const b=camp();b.beginSortie();clear(b);stage(b,"chapter-1-2");clear(b);stage(b,"chapter-1-3");clear(b);stage(b,"chapter-1-4");
 assert.equal(b.units.find(u=>u.id==="e1").classId,"formationBreaker");
 assert.equal(b.units.find(u=>u.id==="e2").classId,"sentinel");
 assert.equal(b.units.find(u=>u.id==="e2").holdPosition,true);
 assert.equal(b.units.find(u=>u.id==="e3").classId,"eliteMarksman");
 b.units.find(u=>u.id==="e3").hp=0;
 assert.equal(b.beginEnemyTurn(),true);assert.equal(b.result,"playing");
 b.units.find(u=>u.id==="e6").hp=0;
 assert.equal(b.beginEnemyTurn(),false);
 assert.deepEqual(b.completedLevelIds,LEVEL_IDS);
});
test("C4-1B C4-1A second-stage victories stay valid and unlock new stage 3",()=>{
 const src=camp(),s=src.campaignSnapshot();
 s.selectedLevelId="chapter-1-2";s.completedLevelIds=["chapter-1-1","chapter-1-2"];
 s.sortiesCompleted=2;s.ridingPermit=true;
 const loaded=readCampaignJson(JSON.stringify(s));
 const b=new Battle({campaign:true,save:loaded});
 assert.equal(b.availableLevels[2].unlocked,true);
 assert.equal(b.selectLevel("chapter-1-3"),true);
 const restored=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(b.campaignSnapshot()))});
 assert.equal(restored.selectedLevelId,"chapter-1-3");
 assert.equal(parseCampaign({...restored.campaignSnapshot(),completedLevelIds:["chapter-1-4"]}),null);
});
