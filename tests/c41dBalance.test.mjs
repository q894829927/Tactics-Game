import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {simulateCampaign,summarize} from "../scripts/c41d-balance.mjs";
import {LEVEL_IDS} from "../src/engine/levels.ts";

test("C4-1D reproducible bounded real-action combat",()=>{
  const a=simulateCampaign({seed:19,maxRounds:24});
  const b=simulateCampaign({seed:19,maxRounds:24});
  assert.deepEqual(a,b);
  assert.ok(a.stages.length>=1&&a.stages.length<=4);
  for(const stage of a.stages){
    assert.ok(LEVEL_IDS.includes(stage.id));
    assert.ok(stage.rounds>=1&&stage.rounds<=24);
    assert.ok(["victory","defeat","timeout"].includes(stage.result));
    assert.ok(stage.actions>0&&stage.attacks>=0&&stage.hits>=0);
    assert.ok(stage.wallet.gold>=0&&stage.wallet.vouchers.intermediate>=0);
  }
});
test("C4-1D promotions and rewards require real completed sorties",()=>{
  const run=simulateCampaign({seed:37,mode:"promotion",grind:1,maxRounds:24});
  assert.ok(run.completedLevels.every(id=>LEVEL_IDS.includes(id)));
  assert.ok(run.wallet.gold>=0&&run.wallet.vouchers>=0);
  for(const stage of run.stages){
    if(stage.result==="victory"){
      assert.equal(stage.rewardKind,"first-clear");
      assert.ok(stage.reward.gold>0);
    }else assert.equal(stage.reward,null);
  }
  for(const replay of run.replays){
    if(replay.result==="victory")assert.equal(replay.rewardKind,"replay");
    else assert.equal(replay.reward,null);
  }
  assert.ok(run.certifications.every(c=>c.cost===150));
  assert.equal(summarize([run]).samples,1);
});
test("C4-1D harness cannot force objectives or mint currency",()=>{
  const source=readFileSync(new URL("../scripts/c41d-balance.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/\.hp\s*=\s*0|\.completedLevelIds\.push|\.preparationFunds\.(gold|vouchers)\s*[+\-=]/);
  assert.match(source,/b\.click\(/);
  assert.match(source,/b\.endTurn\(/);
});

test("C4-1D seeded no-grind clear, four certifications and two extra replays are accounted for",()=>{
  for(const seed of [7,19]){
    const basic=simulateCampaign({seed,mode:"base"});
    assert.equal(basic.cleared,true,"basic party should complete first chapter without replay");
    assert.equal(basic.replays.length,0);
    assert.deepEqual(basic.wallet,{gold:1220,reputation:225,vouchers:6});
    assert.ok(basic.stages.every(stage=>stage.result==="victory"));
    const promoted=simulateCampaign({seed,mode:"promotion"});
    assert.equal(promoted.cleared,true,"legal mid-tier certification should not soft-lock the chapter");
    assert.equal(promoted.certifications.length,4);
    assert.deepEqual(promoted.wallet,{gold:620,reputation:225,vouchers:2});
  }
  const repeat=simulateCampaign({seed:7,mode:"promotion",grind:2});
  assert.equal(repeat.cleared,true);
  assert.equal(repeat.replays.length,2);
  assert.ok(repeat.replays.every(s=>s.result==="victory"&&s.rewardKind==="replay"));
  assert.deepEqual(repeat.wallet,{gold:770,reputation:241,vouchers:2});
  assert.equal(repeat.classXp.filter(c=>c.mastered.length>0).length,4);
});
