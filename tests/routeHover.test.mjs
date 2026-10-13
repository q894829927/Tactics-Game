import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle,distance,key} from "../src/engine/battle.ts";
import {TERRAIN_INFO} from "../src/engine/terrain.ts";
const source=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
const at=(p)=>key(p);

test("enemy and ally previews return only a real weighted Dijkstra route",()=>{
  const b=new Battle();
  for(const unit of [b.units.find(u=>u.id==="a1"),b.units.find(u=>u.id==="e1")]){
    const endpoints=[...b.reachable(unit).keys()];
    const point=endpoints.find(k=>k!==at(unit) && k!=="3,2");
    assert.ok(point);
    const [x,y]=point.split(",").map(Number);
    const result=b.previewMovementAttack(unit,{x,y});
    assert.ok(result);
    assert.deepEqual(result.path[0],{x:unit.x,y:unit.y});
    assert.deepEqual(result.path.at(-1),{x,y});
    let spent=0;
    for(let i=1;i<result.path.length;i++){
      assert.equal(distance(result.path[i-1],result.path[i]),1);
      spent+=TERRAIN_INFO[b.tile(result.path[i].x,result.path[i].y)].moveCost;
    }
    assert.equal(spent,b.reachable(unit).get(point));
    for(const target of result.attack){
      const [tx,ty]=target.split(",").map(Number);
      const d=distance({x,y},{x:tx,y:ty});
      assert.ok(d>=unit.weapon.minRange&&d<=unit.weapon.maxRange);
      assert.notEqual(b.tile(tx,ty),"#");
      assert.notEqual(b.occupant(tx,ty)?.team,unit.team);
    }
  }
});

test("destination-only attack differs from projected union and obeys weapon minRange",()=>{
  const b=new Battle(),bow=b.units.find(u=>u.id==="a3");
  const origin={x:bow.x,y:bow.y};
  const result=b.previewMovementAttack(bow,origin);
  assert.ok(result);
  assert.deepEqual(result.path,[origin]);
  assert.equal(result.attack.has(at({x:origin.x+1,y:origin.y})),false);
  const all=b.allyThreat(bow).attack;
  assert.ok(all.size>=result.attack.size);
  const away=[...b.reachable(bow).keys()].find(k=>k!==at(origin));
  const [x,y]=away.split(",").map(Number);
  const different=b.previewMovementAttack(bow,{x,y});
  assert.ok(different);
  assert.notDeepEqual(different.attack,result.attack);
});

test("no route through cliff or friendly blockers; no second move after moving",()=>{
  const b=new Battle(),unit=b.units.find(u=>u.id==="a1");
  assert.equal(b.previewMovementAttack(unit,{x:3,y:2}),null);
  assert.equal(b.previewMovementAttack(unit,{x:1,y:6}),null);
  b.click(unit.x,unit.y);
  b.click(2,5);
  assert.equal(b.previewMovementAttack(unit,{x:1,y:5}),null);
  assert.ok(b.previewMovementAttack(unit,{x:2,y:5}));
  b.waitSelected();
  assert.equal(b.previewMovementAttack(unit,{x:2,y:5}),null);
});

test("enemy inspection is read-only and result gates forecasts",()=>{
  const b=new Battle(),enemy=b.units.find(u=>u.id==="e1");
  const before=b.units.map(u=>JSON.stringify(u)),logs=[...b.log],events=[...b.lastCombatEvents];
  const spot=[...b.reachable(enemy).keys()].at(-1);
  const [x,y]=spot.split(",").map(Number);
  assert.ok(b.previewMovementAttack(enemy,{x,y}));
  assert.deepEqual(b.units.map(u=>JSON.stringify(u)),before);
  assert.deepEqual(b.log,logs);
  assert.deepEqual(b.lastCombatEvents,events);
  b.result="victory";
  assert.equal(b.previewMovementAttack(enemy,{x,y}),null);
});

test("hovering shows unit move only; selected destination shows route & attack",()=>{
  assert.match(source,/viewport\.addEventListener\("pointermove", event => \{[\s\S]*?this\.trackPointerHover\(event\)/);
  assert.match(source,/viewport\.addEventListener\("pointerleave"/);
  assert.match(source,/const hoverMode=active && !!mouseUnit/);
  assert.match(source,/const focus=hoverMode \? mouseUnit/);
  assert.match(source,/if\(actionable && !hoverMode && focus && this\.hoveredTile/);
  assert.match(source,/previewMovementAttack\(focus,this\.hoveredTile\)/);
  assert.match(source,/this\.drawRoute\(route\)/);
  assert.match(source,/svg\.setAttribute\("viewBox"/);
  assert.match(source,/this\.routeLine\.setAttribute\("d",d\)/);
  assert.match(source,/this\.renderRangeHighlights\(\)/);
  assert.doesNotMatch(source,/const allyPreview = !threat/);
  assert.match(css,/\.tactical-route \{z-index:47/);
  assert.match(css,/\.range-cell\.route-move-enemy/);
  assert.match(css,/\.range-cell\.route-move-ally/);
  assert.match(css,/\.range-cell\.route-attack/);
});
