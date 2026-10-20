import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {LEVELS,LEVEL_IDS,DEFAULT_LEVEL_ID} from "../src/engine/levels.ts";
import {parseCampaign,readCampaignJson} from "../src/engine/campaign.ts";
const camp=()=>new Battle({campaign:true});
function win(b){b.units.find(u=>u.id==="e6").hp=0;
 assert.equal(b.beginEnemyTurn(),false);assert.equal(b.campaignStage,"settlement");}
test("C4-1A legacy 4v6 map and spawns are identical",()=>{
 const b=camp();assert.equal(b.selectedLevelId,DEFAULT_LEVEL_ID);
 assert.deepEqual(b.terrain,LEVELS[DEFAULT_LEVEL_ID].terrain);
 assert.deepEqual(b.units.map(u=>[u.id,u.x,u.y]),
   LEVELS[DEFAULT_LEVEL_ID].spawns.map(u=>[u.id,u.x,u.y]));
 assert.deepEqual(LEVEL_IDS,["chapter-1-1","chapter-1-2"]);
});
test("C4-1A second stage locked until victory; cannot switch in combat",()=>{
 const b=camp();assert.equal(b.selectLevel("chapter-1-2"),false);
 assert.equal(b.selectLevel("fake-stage"),false);
 b.beginSortie();assert.equal(b.selectLevel("chapter-1-2"),false);
 win(b);assert.deepEqual(b.completedLevelIds,["chapter-1-1"]);
 assert.equal(b.pendingSettlement.levelId,"chapter-1-1");
});
test("C4-1A new stage saves progression and preserves ally stats",()=>{
 const b=camp();b.beginSortie();win(b);b.returnToPreparation();
 b.units.find(u=>u.id==="a1").stats.speed+=2;
 const stats={...b.units.find(u=>u.id==="a1").stats};
 const funds=structuredClone(b.preparationFunds);
 assert.equal(b.selectLevel("chapter-1-2"),true);
 assert.deepEqual(b.terrain,LEVELS["chapter-1-2"].terrain);
 assert.deepEqual(b.units.find(u=>u.id==="a1").stats,stats);
 assert.deepEqual(b.preparationFunds,funds);
 const resumed=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(b.campaignSnapshot()))});
 assert.equal(resumed.selectedLevelId,"chapter-1-2");
 assert.deepEqual(resumed.completedLevelIds,["chapter-1-1"]);
 assert.equal(resumed.beginSortie(),true);
});
test("C4-1A defeat, retry, and completed replay keep unlock list unique",()=>{
 const b=camp();b.beginSortie();win(b);b.returnToPreparation();
 b.selectLevel("chapter-1-2");b.beginSortie();
 b.alive("ally").forEach(u=>u.hp=0);
 assert.equal(b.beginEnemyTurn(),false);
 assert.deepEqual(b.completedLevelIds,["chapter-1-1"]);
 b.returnToPreparation();assert.equal(b.selectedLevelId,"chapter-1-2");
 assert.equal(b.beginSortie(),true);b.restart();
 assert.equal(b.selectedLevelId,"chapter-1-2");
 assert.equal(b.selectLevel("chapter-1-1"),true);
 b.beginSortie();win(b);
 assert.deepEqual(b.completedLevelIds,["chapter-1-1"]);
});
test("C4-1A legacy saves migrate and invalid stage IDs are rejected",()=>{
 const b=camp(),save=b.campaignSnapshot();
 delete save.selectedLevelId;delete save.completedLevelIds;
 save.ridingPermit=true;save.sortiesCompleted=1;
 assert.deepEqual(parseCampaign(save).completedLevelIds,["chapter-1-1"]);
 save.ridingPermit=false;
 assert.deepEqual(parseCampaign(save).completedLevelIds,[]);
 const current=b.campaignSnapshot();
 assert.equal(parseCampaign({...current,selectedLevelId:"chapter-1-2"}),null);
 assert.equal(parseCampaign({...current,completedLevelIds:["chapter-1-2"]}),null);
 assert.equal(parseCampaign({...current,completedLevelIds:["chapter-1-1","chapter-1-1"]}),null);
});
test("C4-1A level-2 victory settlement reload and replay",()=>{
 const b=camp();b.beginSortie();win(b);b.returnToPreparation();
 b.selectLevel("chapter-1-2");b.beginSortie();win(b);
 assert.deepEqual(b.completedLevelIds,["chapter-1-1","chapter-1-2"]);
 const resumed=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(b.campaignSnapshot()))});
 assert.equal(resumed.pendingSettlement.levelId,"chapter-1-2");
 resumed.returnToPreparation();resumed.beginSortie();win(resumed);
 assert.deepEqual(resumed.completedLevelIds,["chapter-1-1","chapter-1-2"]);
});
test("C4-1A UI stage selector and ground refresh wired",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 assert.match(html,/id="campaign-level-list"/);
 assert.match(ui,/battle\.selectLevel\(id\)/);
 assert.match(board,/syncLevelTerrain\(\)/);
});
