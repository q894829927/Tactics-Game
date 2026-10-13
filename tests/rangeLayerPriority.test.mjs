import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");

test("move and attack use independent world-space tile grids in z-order",()=>{
  assert.match(board,/private readonly moveHighlights: HTMLDivElement\[\]/);
  assert.match(board,/private readonly attackHighlights: HTMLDivElement\[\]/);
  const movement=board.indexOf('const moveLayer=makeHighlight("move")');
  const attacks=board.indexOf('const attackLayer=makeHighlight("attack")');
  const arrow=board.indexOf('const routeLayer=layer("tactical-route")');
  assert.ok(movement>=0 && attacks>movement && arrow>attacks);
  assert.match(board,/el\.style\.gridTemplateColumns=grid\.style\.gridTemplateColumns/);
  assert.match(board,/el\.style\.gridTemplateRows=grid\.style\.gridTemplateRows/);
  assert.match(board,/el\.setAttribute\("aria-hidden","true"\)/);
  assert.match(board,/moveLayer\.appendChild\(moveCell\)/);
  assert.match(board,/attackLayer\.appendChild\(attackCell\)/);
  assert.match(css,/\.tactical-highlight-move \{ z-index: 45; \}/);
  assert.match(css,/\.tactical-highlight-attack \{ z-index: 46; \}/);
  assert.match(css,/\.tactical-route \{z-index:47;pointer-events:none\}/);
  assert.match(css,/\.world-units \{ z-index: 50; \}/);
});

test("attacking red is only in upper layer and cancels lower blue when overlapping",()=>{
  assert.match(board,/const moveOverlay=this\.moveHighlights\[index\]!/);
  assert.match(board,/const attackOverlay=this\.attackHighlights\[index\]!/);
  const a=board.indexOf("        moveOverlay.className=[");
  const b=board.indexOf("        attackOverlay.className=[",a);
  const c=board.indexOf("        cell.setAttribute(",b);
  assert.ok(a>=0 && b>a && c>b);
  const lower=board.slice(a,b);
  const upper=board.slice(b,c);
  assert.match(lower,/route-move-ally/);
  assert.match(lower,/route-move-enemy/);
  assert.match(lower,/moveFill && attack \? "route-under-attack"/);
  assert.doesNotMatch(lower,/"route-attack"|"can-attack"/);
  assert.match(upper,/targeted\?"can-attack"/);
  assert.match(upper,/attack\?"route-attack"/);
  assert.doesNotMatch(upper,/route-move-ally|route-move-enemy|route-overlap/);
  assert.match(css,/\.tactical-highlight-move \.range-cell\.route-under-attack \{\s*background: transparent;\s*box-shadow: none;/);
  assert.match(css,/\.tactical-highlight-attack \.range-cell\.route-attack,[\s\S]*?background: rgba\(220, 62, 69, \.68\)/);
  assert.doesNotMatch(css,/\.range-cell\.route-overlap\s*\{/);
  assert.doesNotMatch(board,/this\.highlights/);
});

test("neither overlay intercepts input and route line remains above both",()=>{
  assert.match(css,/\.world-stage \.tactical-highlight \{ pointer-events: none; \}/);
  assert.match(board,/const grid = layer\("tactical-hit-grid"\)/);
  assert.match(board,/grid\.appendChild\(cell\)/);
  assert.match(board,/this\.drawRoute\(route\)/);
  assert.match(board,/this\.routeLine=line/);
  assert.match(board,/targeted=this\.attackMode && targeting\.has\(coord\)/);
});
