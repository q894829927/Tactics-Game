import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";

test("auto transition requires every living ally spent; movement alone is not enough",()=>{
  const game=new Battle();
  assert.equal(game.allLivingAlliesSpent,false);
  const alive=game.alive("ally");
  game.click(alive[0].x,alive[0].y);
  game.click(alive[0].x+1,alive[0].y); // no turn completion from movement alone
  assert.equal(game.allLivingAlliesSpent,false);
  game.waitSelected();
  assert.equal(game.allLivingAlliesSpent,false);
  for(const ally of alive.slice(1,-1)){
    game.click(ally.x,ally.y);
    game.waitSelected();
    assert.equal(game.allLivingAlliesSpent,false);
  }
  const last=alive.at(-1);
  game.click(last.x,last.y);
  game.waitSelected();
  assert.equal(game.allLivingAlliesSpent,true);
  assert.equal(game.round,1); // read-only query; browser decides when to advance
  assert.equal(game.log.length,alive.length);
  assert.equal(game.beginEnemyTurn(),true);
  assert.equal(game.allLivingAlliesSpent,false);
  while(game.result==="playing"){
    const plan=game.planEnemyAction();
    if(!plan)break;
    assert.equal(game.commitEnemyAction(plan),true);
  }
  game.finishEnemyTurn();
  assert.equal(game.round,2);
  assert.equal(game.allLivingAlliesSpent,false);
  assert.ok(game.alive("ally").every(ally=>!ally.spent));
});

test("dead allies are excluded, empty party and terminal results never auto-transition",()=>{
  const g=new Battle();
  const one=g.alive("ally")[0];
  for(const ally of g.alive("ally").slice(1))ally.hp=0;
  assert.equal(g.allLivingAlliesSpent,false);
  g.click(one.x,one.y);g.waitSelected();
  assert.equal(g.allLivingAlliesSpent,true);
  one.hp=0;
  assert.equal(g.allLivingAlliesSpent,false);
  g.restart();
  g.result="victory";
  g.units.filter(u=>u.team==="ally").forEach(u=>{u.spent=true;});
  assert.equal(g.allLivingAlliesSpent,false);
  g.result="defeat";
  assert.equal(g.allLivingAlliesSpent,false);
});

test("a confirmed attack counts as complete action; tentative move, preview and weapon change do not",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a1"),e=g.units.find(u=>u.id==="e1");
  for(const other of g.alive("ally").filter(u=>u.id!==a.id))other.spent=true;
  a.x=5;a.y=1;e.x=6;e.y=1;
  g.click(a.x,a.y);
  assert.equal(g.equipWeapon(a,1),true);
  assert.ok(g.forecastAttack(a,e));
  assert.equal(g.allLivingAlliesSpent,false);
  g.click(e.x,e.y);
  assert.equal(a.spent,true);
  assert.equal(g.allLivingAlliesSpent,true);
  assert.equal(g.log.length,1);
  g.result="victory";
  assert.equal(g.allLivingAlliesSpent,false);
});

test("browser defers auto end to post-commit microtask and combat presentation completion",()=>{
  const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
  assert.match(main,/battle\.onChange = \(\)=>\{[\s\S]*?queueMicrotask\(maybeAutoEndTurn\)/);
  assert.match(main,/board\.onCombatPresentationEnded=\(\)=>\{[\s\S]*?maybeAutoEndTurn\(\)/);
  assert.match(main,/function maybeAutoEndTurn\(\): void \{[\s\S]*?endingTurn \|\| board\.isAnimating \|\| battle\.campaignStage!=="battle"[\s\S]*?!battle\.allLivingAlliesSpent/);
  assert.match(main,/function startEnemyTurn\(\): void \{[\s\S]*?if \(endingTurn \|\| board\.isAnimating/);
  assert.match(main,/button\("settings-end-turn"\)\.addEventListener\("click", startEnemyTurn\)/);
  assert.match(main,/mobileEndTurn\.addEventListener\("click",\(\)=>\{[\s\S]*?button\("settings-end-turn"\)\.click\(\)/);
  assert.match(main,/if \(run !== turnRunId \|\| !battle\.beginEnemyTurn\(\)\) return/);
  assert.match(main,/battle\.finishEnemyTurn\(\)/);
});

test("result and remaining active actors gate auto end independent of selection",()=>{
  const b=new Battle();
  for(const u of b.alive("ally"))u.spent=true;
  assert.equal(b.allLivingAlliesSpent,true);
  b.phase="enemy";
  assert.equal(b.allLivingAlliesSpent,false);
  b.phase="player";
  b.result="victory";
  assert.equal(b.allLivingAlliesSpent,false);
  b.result="playing";
  assert.equal(b.allLivingAlliesSpent,true);
});
