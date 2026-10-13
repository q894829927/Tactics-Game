import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Battle } from "../src/engine/battle.ts";
import { buildMapScenery, riverBankX } from "../src/scene/mapScenery.ts";
import { TILE, TACTICAL_X, TACTICAL_Y, TACTICAL_WIDTH, TACTICAL_HEIGHT } from "../src/scene/worldGeometry.ts";

test("forest and wall sprites follow actual terrain, without replacing walkable hill cells", () => {
  const terrain=new Battle().terrain;
  const scenery=buildMapScenery(terrain);
  const inside=scenery.filter(s=>s.terrainCell);
  let count=0;
  for(let y=0;y<terrain.length;y++) for(let x=0;x<terrain[y].length;x++) {
    const type=terrain[y][x];
    const props=inside.filter(s=>s.terrainCell.x===x&&s.terrainCell.y===y);
    assert.equal(props.length,type==="F"||type==="#"?1:0,`${x},${y} ${type}`);
    for(const prop of props) {
      count++;
      assert.ok(prop.x>=TACTICAL_X+x*TILE&&prop.x+prop.width<=TACTICAL_X+(x+1)*TILE);
      assert.ok(prop.y>=TACTICAL_Y+y*TILE&&prop.y+prop.height<=TACTICAL_Y+(y+1)*TILE);
    }
  }
  assert.equal(inside.length,count);
  const cleared=terrain.map(row=>row.replace(/[F#]/g,"."));
  assert.equal(buildMapScenery(cleared).filter(s=>s.terrainCell).length,0);
});

test("decorations and water stay outside playable cells and scenery is stable", () => {
  const terrain=new Battle().terrain;
  const scenery=buildMapScenery(terrain);
  assert.deepEqual(scenery,buildMapScenery(terrain));
  for(const prop of scenery.filter(s=>!s.terrainCell)) {
    const overlaps=prop.x<TACTICAL_X+TACTICAL_WIDTH&&prop.x+prop.width>TACTICAL_X&&
      prop.y<TACTICAL_Y+TACTICAL_HEIGHT&&prop.y+prop.height>TACTICAL_Y;
    assert.equal(overlaps,false,prop.id);
  }
  for(let y=0;y<=1104;y++)assert.ok(riverBankX(y)-13>TACTICAL_X+TACTICAL_WIDTH);
});

test("runtime PNGs retain the original generated sample pixels and real alpha", () => {
  for(const [file,source,alpha] of [
    ["ground-grass.png","ground-style-v1.png",false],
    ["tree-spruce.png","tree-style-v1.png",true],
    ["cliff-moss.png","cliff-style-v1.png",true],
  ]) {
    const bytes=readFileSync(new URL("../public/assets/maps/red-banner/modular/"+file,import.meta.url));
    const original=readFileSync(new URL("../art/map-style-samples/v1/"+source,import.meta.url));
    assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal(bytes[25],alpha?6:2); // PNG IHDR color type: RGBA or RGB.
    assert.equal(createHash("sha256").update(bytes).digest("hex"),createHash("sha256").update(original).digest("hex"));
  }
});
