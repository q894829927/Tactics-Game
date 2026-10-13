import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle,MAP_WIDTH,MAP_HEIGHT,key,distance} from "../src/engine/battle.ts";
const at=(x,y)=>key({x,y});
function expected(game,unit,endpoints){
  const result=new Set();
  for(const point of endpoints){
    const [x,y]=point.split(",").map(Number);
    for(let ty=0;ty<MAP_HEIGHT;ty++)for(let tx=0;tx<MAP_WIDTH;tx++){
      const d=distance({x,y},{x:tx,y:ty});
      if(d<unit.weapon.minRange||d>unit.weapon.maxRange||
         game.tile(tx,ty)==="#"||game.occupant(tx,ty)?.team===unit.team)continue;
      result.add(at(tx,ty));
    }
  }
  return result;
}

test("each ally's range shares weighted reachable and current weapon constraints",()=>{
  const g=new Battle();
  for(const ally of g.alive("ally")){
    const range=g.allyThreat(ally);
    const move=new Set(g.reachable(ally).keys());
    assert.deepEqual(range.move,move);
    assert.deepEqual(range.attack,expected(g,ally,move));
    assert.ok(range.move.has(at(ally.x,ally.y)));
    assert.equal(range.attack.has(at(3,2)),false);
    assert.ok([...range.attack].every(k=>{
      const [x,y]=k.split(",").map(Number);
      return g.occupant(x,y)?.team!=="ally";
    }));
  }
});

test("projected red tiles include places only reachable by moving first",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a1");
  const attack=g.allyThreat(a).attack;
  assert.ok([...attack].some(point=>{
    const [x,y]=point.split(",").map(Number);
    return distance(a,{x,y})>a.weapon.maxRange;
  }));
  assert.equal(g.log.length,0);
});

test("after moving, only the new tile projects attack and cancelling restores projection",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a1");
  const before=g.allyThreat(a);
  g.click(a.x,a.y);
  assert.equal(g.reachable(a).has(at(2,5)),true);
  g.click(2,5);
  const after=g.allyThreat(a);
  assert.deepEqual(after.move,new Set([at(2,5)]));
  assert.deepEqual(after.attack,expected(g,a,after.move));
  assert.notDeepEqual(after.attack,before.attack);
  assert.equal(g.cancelMove(),true);
  assert.deepEqual(g.allyThreat(a),before);
  assert.equal(g.log.length,0);
});

test("bow minimum range and javelin equipment change the projected attack area",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a3");
  a.move=0;g.click(a.x,a.y);
  let red=g.allyThreat(a).attack;
  assert.equal(red.has(at(a.x+1,a.y)),false);
  assert.equal(red.has(at(a.x+2,a.y)),true);
  assert.equal(g.equipWeapon(a,2),true);
  red=g.allyThreat(a).attack;
  assert.equal(red.has(at(a.x+2,a.y)),false);
  assert.equal(red.has(at(a.x+3,a.y)),true);
  const lance=g.units.find(u=>u.id==="a2");
  g.click(lance.x,lance.y);lance.move=0;
  const before=g.allyThreat(lance).attack;
  assert.equal(g.equipWeapon(lance,2),true);
  assert.ok(g.allyThreat(lance).attack.size>before.size);
});

test("wrong team, spent, fallen, enemy phase and terminal states cannot preview ally actions",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a1"),enemy=g.units.find(u=>u.id==="e1");
  const empty={move:new Set(),attack:new Set()};
  assert.deepEqual(g.allyThreat(enemy),empty);
  a.spent=true;assert.deepEqual(g.allyThreat(a),empty);
  a.spent=false;a.acted=true;assert.deepEqual(g.allyThreat(a),empty);
  a.acted=false;g.phase="enemy";assert.deepEqual(g.allyThreat(a),empty);
  g.phase="player";a.hp=0;assert.deepEqual(g.allyThreat(a),empty);
  a.hp=20;g.result="victory";assert.deepEqual(g.allyThreat(a),empty);
});

test("prediction is read-only for position, HP, log and selection",()=>{
  const g=new Battle(),a=g.units.find(u=>u.id==="a1");
  const before=g.units.map(x=>JSON.stringify(x));
  const selected=g.selectedId,round=g.round,logs=[...g.log],events=[...g.lastCombatEvents];
  g.allyThreat(a);g.allyThreat(a);
  assert.deepEqual(g.units.map(x=>JSON.stringify(x)),before);
  assert.equal(g.selectedId,selected);assert.equal(g.round,round);
  assert.deepEqual(g.log,logs);assert.deepEqual(g.lastCombatEvents,events);
});

test("board gives enemy inspection priority and reserves actionable red for real targets",()=>{
  const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
  assert.match(board,/this\.battle\.allyThreat\(focus\)/);
  assert.match(board,/const targeted=this\.attackMode && targeting\.has\(coord\)/);
  assert.match(board,/this\.battle\.enemyThreat\(focus\)/);
  assert.match(css,/\.range-cell\.route-move-ally/);
  assert.match(css,/\.range-cell\.route-attack/);
  assert.match(css,/\.range-cell\.route-overlap/);
});
