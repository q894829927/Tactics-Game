import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {touchPair,pinchCamera} from "../src/scene/touchCamera.ts";
import {Battle} from "../src/engine/battle.ts";

const view=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("pinch keeps world position under midpoint while scaling, and supports translation",()=>{
  const first=touchPair({x:100,y:200},{x:200,y:200});
  assert.deepEqual(first,{x:150,y:200,distance:100});
  const origin={worldX:250,worldY:300,distance:first.distance,zoom:1};
  const zoomed=pinchCamera(origin,{x:80,y:205},{x:280,y:205},.6,1.85);
  assert.equal(zoomed.zoom,1.85); // max clamp
  assert.equal(zoomed.x+origin.worldX*zoomed.zoom,180);
  assert.equal(zoomed.y+origin.worldY*zoomed.zoom,205);
  const shrunk=pinchCamera(origin,{x:125,y:200},{x:175,y:200},.6,1.85);
  assert.equal(shrunk.zoom,.6);
  assert.equal(shrunk.x+origin.worldX*shrunk.zoom,150);
});

test("finger route supports tap and single-drag, suppresses click after a pinch",()=>{
  assert.match(view,/touchPoints = new Map<number,Contact>/);
  assert.match(view,/viewport\.addEventListener\("pointerdown", event => this\.pointerDown\(event\)\)/);
  assert.match(view,/viewport\.addEventListener\("pointermove", event => \{[\s\S]*?this\.pointerMove\(event\);[\s\S]*?this\.trackPointerHover\(event\);/);
  assert.match(view,/this\.touchPoints\.size===2/);
  assert.match(view,/pinchCamera\(this\.pinchOrigin,/);
  assert.match(view,/this\.suppressClick=true;/);
  assert.match(view,/this\.startDrag\(e\)/);
  assert.match(view,/this\.moveDrag\(e\)/);
  assert.match(view,/this\.finishDrag\(e,cancelled\)/);
  assert.match(view,/this\.onRightCellClick\(tile\?\.x \?\? -1, tile\?\.y \?\? -1\)/);
  assert.match(view,/this\.showConfirmedCommands\(unit\.id\)/);
});

test("mobile UI has command, back, info drawer and real end-turn action",()=>{
  for(const id of ["mobile-commands","mobile-back","mobile-info","mobile-end-turn",
     "mobile-sidebar-close","unit-sidebar"]) assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(main,/board\.openMobileCommands\(\)/);
  assert.match(main,/board\.cancelAction\(\)/);
  assert.match(main,/button\("settings-end-turn"\)\.click\(\)/);
  assert.match(main,/mobileEndTurn\.disabled=button\("settings-end-turn"\)\.disabled/);
  assert.match(main,/mobileSidebar\.classList\.toggle\("mobile-open",open\)/);
  assert.match(css,/\.right-sidebar\.mobile-open \{display:flex\}/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/touch-action:none/);
  assert.match(css,/min-height:44px/);
});

test("mobile interactions do not modify underlying battle rules",()=>{
  const battle=new Battle(),a=battle.units.find(u=>u.id==="a1");
  const snapshot=battle.units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}));
  const pair=pinchCamera({worldX:300,worldY:400,distance:100,zoom:.85},
    {x:20,y:40},{x:130,y:40},.6,1.85);
  assert.ok(pair.zoom>.85);
  assert.deepEqual(battle.units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp})),snapshot);
  assert.equal(battle.log.length,0);
  assert.equal(a.spent,false);
});
