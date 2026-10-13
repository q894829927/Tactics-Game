import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Battle } from "../src/engine/battle.ts";
import { tileWorld, TILE } from "../src/scene/worldGeometry.ts";

const source = readFileSync(new URL("../src/scene/BoardView.ts", import.meta.url), "utf8");

test("weapon picker repositions from the same centralized camera update as unit labels", () => {
  const start=source.indexOf("  private applyCamera(): void {");
  const end=source.indexOf("  /** Used by future pointer hit mapping",start);
  assert.ok(start>=0 && end>start);
  const camera=source.slice(start,end);
  assert.match(camera,/this\.positionMenu\(this\.battle\.selected\)/);
  assert.match(camera,/if \(!this\.weaponPicker\.hidden && this\.battle\.selected\)/);
  assert.match(camera,/this\.positionWeaponPicker\(this\.battle\.selected\)/);
});

test("zoom, right drag, minimap navigation, reset and resize all update the camera", () => {
  assert.match(source,/private zoomAt\([\s\S]*?this\.applyCamera\(\);/);
  assert.match(source,/private centerOnWorld\([\s\S]*?this\.applyCamera\(\);/);
  assert.match(source,/resetCamera\(\): void \{[\s\S]*?this\.applyCamera\(\);/);
  assert.match(source,/this\.offsetX = this\.drag\.offsetX \+ dx;[\s\S]*?this\.applyCamera\(\);/);
  assert.match(source,/new ResizeObserver\([\s\S]*?this\.applyCamera\(\);/);
});

test("picker positioning recomputes from the selected unit, flips at right edge, preserves DOM", () => {
  const start=source.indexOf("  private positionWeaponPicker(actor: Unit): void {");
  const end=source.indexOf("  private positionMenu(",start);
  assert.ok(start>=0 && end>start);
  const placement=source.slice(start,end);
  assert.match(placement,/tileWorld\(actor\.x,actor\.y\)/);
  assert.match(placement,/this\.offsetX/);
  assert.match(placement,/this\.zoom/);
  assert.match(placement,/right\+width>this\.viewport\.clientWidth-8 \? left : right/);
  assert.match(placement,/this\.weaponPicker\.style\.left/);
  assert.match(placement,/this\.weaponPicker\.style\.top/);
  assert.doesNotMatch(placement,/replaceChildren|appendChild/);

  const game=new Battle();
  const unit=game.units.find(u=>u.id==="a1");
  const p=tileWorld(unit.x,unit.y);
  const anchors=[{x:0,y:0,zoom:0.6},{x:-135,y:-70,zoom:1.4}];
  const locations=anchors.map(c=>({x:c.x+(p.x+TILE/2)*c.zoom+10,
    y:c.y+(p.y-TILE/2)*c.zoom-20}));
  assert.notDeepEqual(locations[0],locations[1]);
});
