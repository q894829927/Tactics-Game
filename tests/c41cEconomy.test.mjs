import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {LEVEL_IDS} from "../src/engine/levels.ts";
import {readCampaignJson,parseCampaign} from "../src/engine/campaign.ts";
import {FIRST_CLEAR_REWARDS,REPLAY_REWARDS,planSortieReward,
  firstChapterCertificationBudget,emptySortieReward,RESOURCE_CAPS,
  creditSortieReward} from "../src/engine/sortieRewards.ts";
const camp=()=>new Battle({campaign:true});
function win(b){
 const goal=b.currentLevel.victory;
 if(goal.kind==="defeat-unit")b.units.find(u=>u.id===goal.unitId).hp=0;
 else{const actor=b.units.find(u=>u.id==="a1");
   actor.x=goal.x;actor.y=goal.y;actor.spent=true;}
 assert.equal(b.beginEnemyTurn(),false);
 assert.equal(b.result,"victory");
}
function choose(b,id){assert.equal(b.returnToPreparation(),true);
 assert.equal(b.selectLevel(id),true);assert.equal(b.beginSortie(),true);}
test("C4-1C first-clear budget funds 4 classes plus 2 experiments",()=>{
 assert.deepEqual(firstChapterCertificationBudget(),{
  gold:1220,reputation:225,vouchers:{intermediate:6}});
 assert.equal(6*150<=firstChapterCertificationBudget().gold,true);
 const b=camp();b.beginSortie();
 for(let i=0;i<LEVEL_IDS.length;i++){
  if(i>0)choose(b,LEVEL_IDS[i]);
  win(b);
  const expected=FIRST_CLEAR_REWARDS[LEVEL_IDS[i]];
  assert.equal(b.pendingSettlement.rewardKind,"first-clear");
  assert.deepEqual(b.pendingSettlement.reward,expected);
 }
 assert.deepEqual(b.completedLevelIds,LEVEL_IDS);
 assert.deepEqual(b.preparationFunds,firstChapterCertificationBudget());
 assert.deepEqual(b.replayVoucherProgress,[]);
});
test("C4-1C replay same map never farms vouchers, diverse 2-map cycle grants exactly 1",()=>{
 const b=camp();b.beginSortie();win(b);choose(b,"chapter-1-2");win(b);
 // Replaying the first map accumulates one unique replay, not repeated tickets.
 for(let i=0;i<3;i++){
   choose(b,"chapter-1-1");win(b);
   assert.equal(b.pendingSettlement.rewardKind,"replay");
   assert.equal(b.pendingSettlement.reward.vouchers.intermediate,0);
   assert.deepEqual(b.replayVoucherProgress,["chapter-1-1"]);
   assert.equal(b.pendingSettlement.reward.gold,75);
 }
 choose(b,"chapter-1-2");win(b);
 assert.equal(b.pendingSettlement.reward.vouchers.intermediate,1);
 assert.equal(b.pendingSettlement.repeatVoucherEarned,true);
 assert.deepEqual(b.replayVoucherProgress,[]);
 assert.equal(b.preparationFunds.vouchers.intermediate,3);
 choose(b,"chapter-1-2");win(b);
 assert.deepEqual(b.replayVoucherProgress,["chapter-1-2"]);
 choose(b,"chapter-1-1");win(b);
 assert.equal(b.pendingSettlement.reward.vouchers.intermediate,1);
 assert.deepEqual(b.replayVoucherProgress,[]);
});
test("C4-1C defeat and abandoned sortie never accrue replay progress",()=>{
 const b=camp();b.beginSortie();win(b);choose(b,"chapter-1-1");win(b);
 assert.deepEqual(b.replayVoucherProgress,["chapter-1-1"]);
 assert.equal(b.returnToPreparation(),true);
 b.beginSortie();b.alive("ally").forEach(u=>u.hp=0);
 assert.equal(b.beginEnemyTurn(),false);
 assert.deepEqual(b.pendingSettlement.reward,emptySortieReward());
 assert.equal(b.pendingSettlement.rewardKind,"defeat");
 assert.deepEqual(b.replayVoucherProgress,["chapter-1-1"]);
 b.returnToPreparation();b.beginSortie();b.restart();
 assert.deepEqual(b.replayVoucherProgress,["chapter-1-1"]);
});
test("C4-1C pure reward preview returns fresh values and never mutates progress",()=>{
 const completed=["chapter-1-1","chapter-1-2"],partial=["chapter-1-1"];
 const snapshot=JSON.stringify({completed,partial});
 const preview=planSortieReward("victory","chapter-1-2",completed,partial);
 assert.equal(preview.kind,"replay");
 assert.equal(preview.repeatVoucherEarned,true);
 assert.deepEqual(preview.nextReplayIds,[]);
 preview.reward.gold=999;preview.reward.vouchers.intermediate=99;
 assert.deepEqual(planSortieReward("victory","chapter-1-2",completed,partial).reward,
  {gold:100,reputation:10,vouchers:{intermediate:1}});
 assert.equal(JSON.stringify({completed,partial}),snapshot);
 assert.deepEqual(planSortieReward("defeat","chapter-1-2",completed,partial).nextReplayIds,partial);
});
test("C4-1C settlement reload/restart cannot pay a second first or replay bonus",()=>{
 const b=camp();b.beginSortie();win(b);
 const once=structuredClone(b.preparationFunds);
 const serialized=JSON.stringify(b.campaignSnapshot());
 const resumed=new Battle({campaign:true,save:readCampaignJson(serialized)});
 assert.deepEqual(resumed.preparationFunds,once);
 assert.equal(resumed.pendingSettlement.rewardKind,"first-clear");
 assert.equal(resumed.beginEnemyTurn(),false);
 assert.deepEqual(resumed.preparationFunds,once);
 resumed.restart(); // settlement restart must preserve committed reward
 assert.deepEqual(resumed.preparationFunds,once);
 assert.deepEqual(resumed.completedLevelIds,["chapter-1-1"]);
 assert.equal(resumed.campaignStage,"preparation");
 resumed.beginSortie();win(resumed);
 assert.equal(resumed.pendingSettlement.rewardKind,"replay");
 assert.deepEqual(resumed.pendingSettlement.reward,REPLAY_REWARDS["chapter-1-1"]);
 const snapshot=JSON.stringify(resumed.campaignSnapshot());
 const twice=new Battle({campaign:true,save:readCampaignJson(snapshot)});
 assert.deepEqual(twice.replayVoucherProgress,["chapter-1-1"]);
 assert.deepEqual(twice.preparationFunds,resumed.preparationFunds);
 assert.equal(twice.returnToPreparation(),true);
 assert.deepEqual(twice.preparationFunds,resumed.preparationFunds);
});
test("C4-1C legacy C4-1B save keeps old payouts, migrates replay tracker to empty",()=>{
 const b=camp();b.beginSortie();win(b);
 const historical=structuredClone(b.campaignSnapshot());
 delete historical.replayVoucherProgress;
 delete historical.pendingSettlement.rewardKind;
 delete historical.pendingSettlement.repeatVoucherEarned;
 historical.funds.gold=19;
 const parsed=parseCampaign(historical);
 assert.deepEqual(parsed.replayVoucherProgress,[]);
 assert.equal(parsed.pendingSettlement.rewardKind,undefined);
 const actual=new Battle({campaign:true,save:parsed});
 assert.equal(actual.preparationFunds.gold,19);
 actual.returnToPreparation();
 assert.equal(actual.preparationFunds.gold,19);
});
test("C4-1C reject forged voucher milestone; capping wallet remains atomic",()=>{
 const b=camp(),s=b.campaignSnapshot();
 assert.equal(parseCampaign({...s,replayVoucherProgress:["chapter-1-2"]}),null);
 assert.equal(parseCampaign({...s,replayVoucherProgress:["made-up"]}),null);
 assert.equal(parseCampaign({...s,replayVoucherProgress:["chapter-1-1","chapter-1-1"]}),null);
 assert.equal(parseCampaign({...s,replayVoucherProgress:3}),null);
 const cap={gold:RESOURCE_CAPS.gold,reputation:RESOURCE_CAPS.reputation,
  vouchers:{intermediate:RESOURCE_CAPS.intermediate}};
 const credited=creditSortieReward(cap,FIRST_CLEAR_REWARDS["chapter-1-4"]);
 assert.deepEqual(credited.awarded,emptySortieReward());
 assert.deepEqual(credited.funds,cap);
});
test("C4-1C battle UI previews rewards and settlement kind",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 for(const id of ["campaign-reward-preview","campaign-reward-kind"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(main,/planSortieReward\("victory",battle\.selectedLevelId/);
 assert.match(main,/outcome\.rewardKind==="first-clear"/);
});
