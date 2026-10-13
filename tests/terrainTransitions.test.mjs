import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Battle, MAP_WIDTH, MAP_HEIGHT } from "../src/engine/battle.ts";
import {
  MICRO_COLS, MICRO_ROWS, MICRO_TILE, M1_SLICE,
  microTileMaterial, microTileSeed, grassEdgeMask, m1SliceGround,
} from "../src/scene/terrainTransitions.ts";
import { groundSurfaceAt } from "../src/scene/groundSurface.ts";
import { buildMapScenery, riverBankX } from "../src/scene/mapScenery.ts";
import { TILE, TACTICAL_X, TACTICAL_WIDTH, TACTICAL_Y, TACTICAL_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from "../src/scene/worldGeometry.ts";

test("M1 6x5 slice fits 16x12 and contains 30 addressable terrain cells", () => {
  const terrain=new Battle().terrain;
  assert.deepEqual(M1_SLICE,{col:10,row:4,cols:6,rows:5});
  const tiles=m1SliceGround(terrain);
  assert.equal(tiles.length,30);
  assert.ok(tiles.some(t=>t.surface==="earth") && tiles.some(t=>t.surface==="grass"));
  assert.ok(tiles.every(t=>t.col>=10&&t.col<=15&&t.row>=4&&t.row<=8));
  assert.ok(tiles.some(t=>t.grassEdges!==0));
  const sliceStart=M1_SLICE.col*TILE, sliceEnd=(M1_SLICE.col+M1_SLICE.cols)*TILE;
  assert.ok(sliceStart<TACTICAL_X+TACTICAL_WIDTH);
  assert.ok(sliceEnd>riverBankX(550));
});

test("M2 all 768 microtiles derive their surface from authoritative 10x8 terrain", () => {
  const terrain=new Battle().terrain;
  assert.equal(MICRO_TILE,46);
  assert.equal(MICRO_COLS,32);
  assert.equal(MICRO_ROWS,24);
  assert.equal(MICRO_COLS*MICRO_ROWS,768);
  for(let y=0;y<MICRO_ROWS;y++)for(let x=0;x<MICRO_COLS;x++) {
    assert.equal(microTileMaterial(terrain,x,y),
      groundSurfaceAt(terrain,Math.floor(x/2),Math.floor(y/2)));
    const seed=microTileSeed(x,y);
    assert.ok(seed>=0&&seed<1);
    assert.equal(seed,microTileSeed(x,y));
  }
  for(const [x,y] of [[-1,0],[0,-1],[32,0],[0,24],[.5,4]]) {
    assert.throws(()=>microTileMaterial(terrain,x,y),RangeError);
  }
});

test("terrain adjacency responds to map changes without modifying battle rules", () => {
  const terrain=Array(8).fill("..........");
  terrain[0]=".G........";
  const worldCol=TACTICAL_X/TILE+1,worldRow=TACTICAL_Y/TILE;
  assert.equal(groundSurfaceAt(terrain,worldCol,worldRow),"grass");
  // North side is decorative grass, west/south/east are earth.
  assert.equal(grassEdgeMask(terrain,worldCol,worldRow),2|4|8);
  assert.equal(grassEdgeMask(terrain,worldCol-1,worldRow),0);
  terrain[0]="..........";
  assert.equal(grassEdgeMask(terrain,worldCol,worldRow),0);
});

test("shoreline props and water remain east of playable grid; full scene deterministic", () => {
  const terrain=new Battle().terrain,scene=buildMapScenery(terrain);
  assert.deepEqual(scene,buildMapScenery(terrain));
  const shore=scene.filter(p=>p.id.startsWith("shore-"));
  assert.equal(shore.filter(p=>p.id.startsWith("shore-rock-")).length,8);
  assert.equal(shore.filter(p=>p.id.startsWith("shore-spruce-")).length,4);
  assert.ok(shore.some(p=>p.y>=M1_SLICE.row*TILE&&p.y<(M1_SLICE.row+M1_SLICE.rows)*TILE));
  for(const p of shore) {
    assert.equal(p.terrainCells.length,0);
    assert.ok(p.x>=TACTICAL_X+TACTICAL_WIDTH,p.id);
    assert.ok(p.x+p.width<=WORLD_WIDTH,p.id);
    assert.ok(p.y>=0&&p.y+p.height<=WORLD_HEIGHT,p.id);
  }
  for(let y=0;y<=WORLD_HEIGHT;y++)assert.ok(riverBankX(y)-25>TACTICAL_X+TACTICAL_WIDTH);
});

test("art overlays do not steal pointer events or alter the only tactical hit grid", () => {
  const painter=readFileSync(new URL("../src/scene/GroundPainter.ts",import.meta.url),"utf8");
  const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
  assert.match(painter,/this\.microDetail\(ctx,earth\)/);
  assert.match(painter,/this\.microDetail\(layer,grass\)/);
  assert.match(painter,/preview\.drawImage\(this\.canvas,0,0,512,384\)/);
  assert.match(board,/grid\.appendChild\(cell\)/);
  assert.match(board,/world\.appendChild\(element\)/);
  assert.match(css,/\.world-environment, \.world-foreground, \.world-ground \{ pointer-events: none !important/);
  assert.match(css,/\.world-stage \.tactical-hit-grid \{ pointer-events: auto/);
});
