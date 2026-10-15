import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {ALLY_IDS,readCampaignJson,parseCampaign} from "../src/engine/campaign.ts";
import {calculateSortieReward,creditSortieReward,RESOURCE_CAPS,
  emptySortieReward} from "../src/engine/sortieRewards.ts";

const camp=()=>new Battle({campaign:true});
const ally=(game,id="a1")=>game.units.find(u=>u.id===id);
function resolve(game,result="victory"){
  if(result==="victory")game.units.find(u=>u.id==="e6").hp=0;
  else game.alive("ally").forEach(u=>{u.hp=0;});
  assert.equal(game.beginEnemyTurn(),false);
  assert.equal(game.campaignStage,"settlement");
}

test("C2-1 reward table is deterministic and produces independent values",()=>{
  assert.deepEqual(calculateSortieReward("victory"),
    {gold:200,reputation:40,vouchers:{intermediate:1}});
  assert.deepEqual(calculateSortieReward("defeat"),emptySortieReward());
  const a=calculateSortieReward("victory");
  a.vouchers.intermediate=40;a.gold=999;
  assert.deepEqual(calculateSortieReward("victory"),
    {gold:200,reputation:40,vouchers:{intermediate:1}});
});

test("C2-1 win credits resources once at terminal state, never by reopening settlement",()=>{
  const game=camp();
  assert.equal(game.preparationFunds.gold,0);
  assert.equal(game.beginSortie(),true);
  resolve(game);
  const expected={gold:200,reputation:40,vouchers:{intermediate:1}};
  assert.deepEqual(game.preparationFunds,expected);
  assert.deepEqual(game.pendingSettlement.reward,expected);
  assert.equal(game.sortiesCompleted,1);
  assert.equal(game.beginEnemyTurn(),false);
  assert.equal(game.returnToPreparation(),true);
  assert.deepEqual(game.preparationFunds,expected);
  assert.equal(game.returnToPreparation(),false);
  assert.equal(game.beginSortie(),true);
  assert.deepEqual(game.preparationFunds,expected,"another sortie grants nothing at its start");
});

test("C2-1 defeat gives no currency, reputation, or vouchers",()=>{
  const game=camp();game.beginSortie();
  resolve(game,"defeat");
  assert.deepEqual(game.pendingSettlement.reward,emptySortieReward());
  assert.deepEqual(game.preparationFunds,{gold:0,reputation:0,vouchers:{intermediate:0}});
  game.returnToPreparation();
  assert.equal(game.sortiesCompleted,1);
  assert.deepEqual(game.preparationFunds,{gold:0,reputation:0,vouchers:{intermediate:0}});
});

test("C2-1 one victory supports actual D-qualified duelist certification",()=>{
  const game=camp(),fighter=ally(game,"a1");
  assert.equal(game.classStatus(fighter,"duelist").eligible,false);
  game.beginSortie();resolve(game);game.returnToPreparation();
  const current=ally(game);
  assert.equal(current.weaponExp.sword,120,"starting swordsman has C");
  assert.equal(game.classStatus(current,"duelist").eligible,true);
  assert.equal(game.changeClass("a1","duelist"),true);
  assert.equal(current.classId,"duelist");
  assert.equal(game.preparationFunds.gold,50);
  assert.equal(game.preparationFunds.reputation,40,"reputation is a threshold, not spent");
  assert.equal(game.preparationFunds.vouchers.intermediate,0);
  assert.equal(current.classLicenses.filter(id=>id==="duelist").length,1);
  assert.equal(game.changeClass("a1","sword"),true);
  assert.equal(game.changeClass("a1","duelist"),true,"certified class switches at no extra charge");
  assert.equal(game.preparationFunds.gold,50);
  assert.equal(game.preparationFunds.vouchers.intermediate,0);
});

test("C2-1 second win earns another voucher; qualifications stay per character",()=>{
  const game=camp();
  game.beginSortie();resolve(game);game.returnToPreparation();
  assert.equal(game.changeClass("a1","duelist"),true);
  const mage=ally(game,"a4");
  assert.equal(game.classStatus(mage,"duelist").eligible,false,"mage lacks sword D");
  game.beginSortie();resolve(game);game.returnToPreparation();
  assert.deepEqual(game.preparationFunds,{gold:250,reputation:80,
    vouchers:{intermediate:1}});
  assert.equal(game.classStatus(ally(game,"a2"),"sentinel").eligible,true);
  assert.equal(game.changeClass("a2","sentinel"),true);
  assert.deepEqual(game.preparationFunds,{gold:100,reputation:80,
    vouchers:{intermediate:0}});
  assert.equal(ally(game,"a1").classLicenses.includes("sentinel"),false);
  assert.equal(ally(game,"a2").classLicenses.includes("sentinel"),true);
});

test("C2-1 pending settlement survives reload with reward but never pays twice",()=>{
  const game=camp();game.beginSortie();resolve(game);
  const raw=JSON.stringify(game.campaignSnapshot());
  const reload=new Battle({campaign:true,save:readCampaignJson(raw)});
  assert.equal(reload.campaignStage,"settlement");
  assert.deepEqual(reload.pendingSettlement.reward,
    {gold:200,reputation:40,vouchers:{intermediate:1}});
  assert.deepEqual(reload.preparationFunds,
    {gold:200,reputation:40,vouchers:{intermediate:1}});
  reload.returnToPreparation();
  assert.equal(reload.sortiesCompleted,1);
  assert.equal(reload.preparationFunds.gold,200);
  assert.equal(reload.beginSortie(),true);
  assert.equal(reload.preparationFunds.gold,200);
});

test("C2-1 C2-0 legacy pending settlement loads with zero retroactive payout",()=>{
  const game=camp();game.beginSortie();resolve(game);
  const historical=structuredClone(game.campaignSnapshot());
  historical.funds={gold:50,reputation:8,vouchers:{intermediate:0}};
  delete historical.pendingSettlement.reward;
  const checked=parseCampaign(historical);
  assert.ok(checked);
  assert.deepEqual(checked.pendingSettlement.reward,emptySortieReward());
  assert.equal(historical.pendingSettlement.reward,undefined,"read-only migration");
  const resumed=new Battle({campaign:true,save:readCampaignJson(JSON.stringify(historical))});
  assert.deepEqual(resumed.pendingSettlement.reward,emptySortieReward());
  assert.deepEqual(resumed.preparationFunds,historical.funds);
  resumed.returnToPreparation();
  assert.deepEqual(resumed.preparationFunds,historical.funds);
});

test("C2-1 rejects malformed reward fields and enforces storage bounds",()=>{
  const game=camp();game.beginSortie();resolve(game);
  const save=game.campaignSnapshot();
  for(const mutate of [
    x=>{x.pendingSettlement.reward.gold=-1;},
    x=>{x.pendingSettlement.reward.reputation=NaN;},
    x=>{x.pendingSettlement.reward.vouchers.intermediate=1.4;},
    x=>{x.pendingSettlement.reward.vouchers={};},
    x=>{x.pendingSettlement.reward="invalid";},
  ]){
    const copy=structuredClone(save);mutate(copy);
    assert.equal(parseCampaign(copy),null);
  }
  assert.equal(readCampaignJson(JSON.stringify(save))!==null,true);
  const limit={gold:RESOURCE_CAPS.gold,reputation:RESOURCE_CAPS.reputation,
    vouchers:{intermediate:RESOURCE_CAPS.intermediate}};
  const credited=creditSortieReward(limit,calculateSortieReward("victory"));
  assert.deepEqual(credited.funds,limit);
  assert.deepEqual(credited.awarded,emptySortieReward());
});

test("C2-1 resources survive reloading preparation, while failed sortie cannot farm",()=>{
  const game=camp();game.beginSortie();resolve(game);game.returnToPreparation();
  const serialized=JSON.stringify(game.campaignSnapshot());
  const resumed=new Battle({campaign:true,save:readCampaignJson(serialized)});
  assert.equal(resumed.campaignStage,"preparation");
  assert.deepEqual(resumed.preparationFunds,{gold:200,reputation:40,
    vouchers:{intermediate:1}});
  resumed.beginSortie();
  ally(resumed).weaponExp.sword+=10;
  resumed.restart();
  assert.equal(resumed.sortiesCompleted,1);
  assert.deepEqual(resumed.preparationFunds,{gold:200,reputation:40,
    vouchers:{intermediate:1}});
  assert.equal(ally(resumed).weaponExp.sword,120);
});

test("C2-1 interface displays earned wallet and actual settlement rewards",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
  for(const name of ["campaign-gold","campaign-reputation","campaign-intermediate-vouchers",
    "campaign-reward-gold","campaign-reward-reputation","campaign-reward-vouchers"])
    assert.match(html,new RegExp('id="'+name+'"'));
  assert.match(main,/get\("campaign-gold"\)\.textContent/);
  assert.match(main,/get\("campaign-reward-gold"\)\.textContent/);
  assert.match(main,/outcome\.reward\.vouchers\.intermediate/);
  assert.match(css,/\.campaign-wallet\{/);
});
