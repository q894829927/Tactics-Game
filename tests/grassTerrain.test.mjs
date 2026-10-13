import assert from "node:assert/strict";
import test from "node:test";
import { Battle } from "../src/engine/battle.ts";
import { TERRAIN_INFO, movementCostLabel } from "../src/engine/terrain.ts";
import { groundSurfaceAt } from "../src/scene/groundSurface.ts";

test("grass consumes more movement than earth and still permits movement undo", () => {
  const battle=new Battle();
  battle.click(1,5);
  const actor=battle.selected;
  assert.equal(battle.tile(0,5),"G");
  assert.equal(battle.reachable(actor).get("2,5"),1);
  assert.equal(battle.reachable(actor).get("0,5"),2);
  assert.equal(battle.reachable(actor).has("0,4"),false);
  assert.equal(movementCostLabel("."),"1");
  assert.equal(movementCostLabel("G"),"2");
  assert.equal(movementCostLabel("#"),"不可通行");
  battle.click(0,5);
  assert.deepEqual({x:actor.x,y:actor.y},{x:0,y:5});
  assert.equal(actor.moved,true);
  assert.equal(actor.spent,false);
  assert.equal(battle.cancelMove(),true);
  assert.deepEqual({x:actor.x,y:actor.y},{x:1,y:5});
  assert.equal(battle.reachable(actor).get("0,5"),2);
});

test("weighted pathfinding finds a cheaper earth detour around grass", () => {
  const battle=new Battle(),actor=battle.units.find(unit=>unit.id==="a1");
  battle.terrain=[".GGG......","..........",...Array(6).fill("##########")];
  battle.units=[actor];actor.x=0;actor.y=0;actor.move=6;
  // Four direct steps cost 7; six steps through the earth row cost 6.
  assert.equal(battle.reachable(actor).get("4,0"),6);
  assert.equal(battle.reachable(actor).get("1,0"),2);
  actor.move=1;
  assert.equal(battle.reachable(actor).has("1,0"),false);
  assert.equal(battle.reachable(actor).get("0,1"),1);
});

test("enemy movement respects the same grass cost as allied movement", () => {
  const advance=(row)=>{
    const battle=new Battle(),ally=battle.units.find(unit=>unit.id==="a1"),enemy=battle.units.find(unit=>unit.id==="e6");
    battle.terrain=[row,...Array(7).fill("##########")];
    battle.units=[ally,enemy];ally.x=0;ally.y=0;enemy.x=4;enemy.y=0;
    battle.endTurn();
    return enemy.x;
  };
  assert.equal(advance("GGGGG....."),3);
  assert.equal(advance(".........."),2);
});

test("grass adds no defense or extra attack/counter damage modifier", () => {
  const battle=new Battle(),actor=battle.units.find(unit=>unit.id==="a1"),enemy=battle.units.find(unit=>unit.id==="e1");
  actor.x=0;actor.y=0;enemy.x=1;enemy.y=0;
  battle.terrain=[".G........",...Array(7).fill("..........")];
  const grassForecast=battle.forecastAttack(actor,enemy);
  battle.terrain=Array(8).fill("..........");
  assert.deepEqual(grassForecast,battle.forecastAttack(actor,enemy));
  assert.equal(grassForecast.damage,9);
  assert.equal(TERRAIN_INFO.G.defense,0);
});

test("ground material follows tactical terrain and the decorative border remains grass", () => {
  const battle=new Battle();
  let earth=0,grass=0;
  for(let y=0;y<8;y++)for(let x=0;x<10;x++) {
    const code=battle.tile(x,y),surface=groundSurfaceAt(battle.terrain,x+3,y+2);
    if(code==="."||code==="#") {assert.equal(surface,"earth");earth++;}
    else {assert.equal(surface,"grass");grass++;}
  }
  assert.ok(earth>0&&grass>0);
  assert.equal(groundSurfaceAt(battle.terrain,0,0),"grass");
  assert.equal(groundSurfaceAt(battle.terrain,15,11),"grass");
});
