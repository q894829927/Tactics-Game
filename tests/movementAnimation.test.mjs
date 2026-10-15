import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {Battle, distance, key} from "../src/engine/battle.ts";
import {TERRAIN_INFO} from "../src/engine/terrain.ts";

test("lowest-cost path is adjacent, legal and agrees with weighted reachable", () => {
  const battle=new Battle();
  for(const actor of [...battle.alive("ally"),...battle.alive("enemy")]) {
    for(const [dest,cost] of battle.reachable(actor)) {
      const [x,y]=dest.split(",").map(Number);
      const route=battle.movementPath(actor,{x,y});
      assert.ok(route,"route missing "+actor.id+" "+dest);
      assert.deepEqual(route[0],{x:actor.x,y:actor.y});
      assert.deepEqual(route.at(-1),{x,y});
      let spent=0;
      for(let i=1;i<route.length;i++){
        assert.equal(distance(route[i-1],route[i]),1);
        const occupant=battle.occupant(route[i].x,route[i].y);
        if(i===route.length-1)
          assert.equal(occupant,undefined,"movement must end on an empty cell");
        else
          assert.ok(!occupant||occupant.team===actor.team,
            "only allies may occupy an intermediate path tile");
        spent+=TERRAIN_INFO[battle.tile(route[i].x,route[i].y)].moveCost;
      }
      assert.equal(spent,cost);
    }
  }
  const a=battle.units.find(u=>u.id==="a1");
  assert.equal(battle.movementPath(a,{x:3,y:2}),null);
  assert.equal(battle.movementPath(a,{x:1,y:6}),null);
});

test("enemy advances in individual completed actions, and round ends afterward", () => {
  const battle=new Battle();
  assert.equal(battle.beginEnemyTurn(),true);
  assert.equal(battle.phase,"enemy");
  assert.equal(battle.round,1);
  assert.equal(battle.beginEnemyTurn(),false);
  let actions=0;
  while(true) {
    const plan=battle.planEnemyAction();
    if (!plan) break;
    assert.equal(battle.planEnemyAction().unitId,plan.unitId);
    const snapshot=battle.units.map(u=>({...u}));
    assert.equal(battle.commitEnemyAction({...plan,unitId:"wrong"}),false);
    assert.deepEqual(battle.units,snapshot);
    assert.equal(plan.path.at(-1).x,plan.destination.x);
    assert.equal(plan.path.at(-1).y,plan.destination.y);
    const before=battle.log.length;
    assert.equal(battle.commitEnemyAction(plan),true);
    assert.equal(battle.log.length,before+1);
    actions++;
    assert.equal(battle.round,1);
    if(battle.result!=="playing")break;
  }
  assert.ok(actions>0);
  assert.equal(battle.finishEnemyTurn(),true);
  if (battle.result==="playing") {
    assert.equal(battle.round,2);
    assert.equal(battle.phase,"player");
    assert.equal(battle.alive("ally").every(u=>!u.spent),true);
  }
});

test("battle commands are locked while enemies are acting", () => {
  const game=new Battle();
  const actor=game.units.find(u=>u.id==="a1");
  game.beginEnemyTurn();
  game.click(actor.x,actor.y);
  assert.equal(game.selectedId,null);
  game.waitSelected();
  assert.equal(game.selectedId,null);
  assert.equal(game.phase,"enemy");
});

test("presentation interpolates footpoints and sequential orchestration commits after walking", () => {
  const view=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
  assert.match(view,/requestAnimationFrame\(frame\)/);
  assert.match(view,/if \(path\.length < 2\) return;/);
  assert.doesNotMatch(view,/prefers-reduced-motion/,
    "OS reduced motion must not skip step-by-step unit movement");
  assert.match(view,/const duration = 165;/);
  assert.match(view,/this\.animationPose = \{id: unitId,/);
  assert.match(view,/this\.paintAnimationPose\(\)/);
  assert.match(view,/this\.battle\.movementPath\(mover, \{x, y\}\)/);
  assert.match(view,/this\.animationLocked/);
  assert.match(view,/this\.pinNodes\.get\(pose\.id\)/);
  assert.match(main,/await board\.animateMovement\(plan\.unitId, plan\.path\)/);
  assert.match(main,/battle\.commitEnemyAction\(plan\)/);
  assert.match(main,/battle\.finishEnemyTurn\(\)/);
  assert.match(main,/turnRunId\+\+/);
});
