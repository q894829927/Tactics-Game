import test from "node:test";
import assert from "node:assert/strict";
import {Battle,key} from "../src/engine/battle.ts";

const at=(x,y)=>key({x,y});
const unit=(game,id)=>game.units.find(u=>u.id===id);

test("allies traverse living allies with normal terrain costs, but cannot stop on them",()=>{
  const game=new Battle();
  const actor=unit(game,"a1"),friend=unit(game,"a2");
  actor.move=3;friend.x=2;friend.y=5;
  const reachable=game.reachable(actor);
  assert.equal(reachable.get(at(1,5)),0,"own starting tile stays legal");
  assert.equal(reachable.has(at(2,5)),false,"living teammate is transit only");
  assert.equal(reachable.get(at(3,5)),3,"cost 1 through teammate plus cost 2 grass");
  assert.deepEqual(game.movementPath(actor,{x:3,y:5}),[
    {x:1,y:5},{x:2,y:5},{x:3,y:5},
  ]);
  assert.equal(game.movementPath(actor,{x:2,y:5}),null);
  assert.equal(game.previewMovementAttack(actor,{x:2,y:5}),null);
  assert.equal(game.allyThreat(actor).move.has(at(2,5)),false,
    "friendly occupied tiles never appear as legal blue destinations");
  assert.equal(game.allyThreat(actor).move.has(at(3,5)),true);
  assert.equal(game.previewMovementAttack(actor,{x:3,y:5}).path.length,3);
  game.click(actor.x,actor.y);
  game.click(friend.x,friend.y);
  assert.equal(game.selectedId,friend.id,"clicking a teammate selects them instead of stacking");
  game.click(actor.x,actor.y);
  game.click(3,5);
  assert.deepEqual({x:actor.x,y:actor.y},{x:3,y:5});
  assert.deepEqual({x:friend.x,y:friend.y},{x:2,y:5});
  assert.equal(game.cancelMove(),true);
  assert.deepEqual({x:actor.x,y:actor.y},{x:1,y:5});
  assert.equal(game.log.length,0,"tentative movement does not commit");
});

test("enemy blockers and cliffs remain impassable; defeated enemies do not block",()=>{
  const game=new Battle(),actor=unit(game,"a1"),enemy=unit(game,"e1");
  actor.move=3;enemy.x=2;enemy.y=5;
  assert.equal(game.reachable(actor).has(at(3,5)),false,
    "hostile occupant blocks the only three-cost route");
  assert.equal(game.movementPath(actor,{x:2,y:5}),null);
  assert.equal(game.movementPath(actor,{x:3,y:5}),null);
  assert.equal(game.reachable(actor).has(at(3,2)),false,"cliff stays blocked");
  enemy.hp=0;
  assert.equal(game.reachable(actor).get(at(3,5)),3);
  assert.deepEqual(game.movementPath(actor,{x:3,y:5}),[
    {x:1,y:5},{x:2,y:5},{x:3,y:5},
  ]);
});

test("enemy units cross teammates and use empty destinations for threat and AI plans",()=>{
  const game=new Battle();
  const actor=unit(game,"e1"),friend=unit(game,"e2");
  actor.x=1;actor.y=5;actor.move=3;
  friend.x=2;friend.y=5;
  const [target,...others]=game.units.filter(u=>u.team==="ally");
  target.x=4;target.y=5;
  others.forEach((u,index)=>{u.x=9;u.y=index;});
  assert.equal(game.reachable(actor).has(at(2,5)),false);
  assert.equal(game.reachable(actor).get(at(3,5)),3);
  assert.deepEqual(game.movementPath(actor,{x:3,y:5}),[
    {x:1,y:5},{x:2,y:5},{x:3,y:5},
  ]);
  const threat=game.enemyThreat(actor);
  assert.equal(threat.move.has(at(2,5)),false);
  assert.equal(threat.move.has(at(3,5)),true);
  assert.equal(threat.attack.has(at(4,5)),true);
  assert.equal(game.beginEnemyTurn(),true);
  const plan=game.planEnemyAction();
  assert.equal(plan.unitId,actor.id);
  assert.deepEqual(plan.destination,{x:3,y:5});
  assert.deepEqual(plan.path,[{x:1,y:5},{x:2,y:5},{x:3,y:5}]);
  assert.equal(game.commitEnemyAction(plan),true);
  assert.deepEqual({x:actor.x,y:actor.y},{x:3,y:5});
  assert.deepEqual({x:friend.x,y:friend.y},{x:2,y:5});
});

test("both teams cannot end movement on any living occupied tile, including hostile ones",()=>{
  const game=new Battle(),friend=unit(game,"a2"),ally=unit(game,"a1"),enemy=unit(game,"e1");
  ally.move=9;enemy.move=9;
  const before=game.units.map(u=>[u.id,u.x,u.y,u.hp]);
  assert.equal(game.movementPath(ally,{x:friend.x,y:friend.y}),null);
  assert.equal(game.movementPath(ally,{x:enemy.x,y:enemy.y}),null);
  assert.equal(game.movementPath(enemy,{x:ally.x,y:ally.y}),null);
  assert.equal(game.movementPath(enemy,{x:friend.x,y:friend.y}),null);
  assert.deepEqual(game.units.map(u=>[u.id,u.x,u.y,u.hp]),before);
});
