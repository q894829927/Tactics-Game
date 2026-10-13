import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { Battle } from "../src/engine/battle.ts";
import { buildMapScenery, riverBankX } from "../src/scene/mapScenery.ts";
import { TILE, TACTICAL_X, TACTICAL_Y, TACTICAL_WIDTH, TACTICAL_HEIGHT } from "../src/scene/worldGeometry.ts";
import { MAP_ASSET_FILES } from "../src/scene/mapAssetFiles.ts";

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

test("content-hashed runtime WebP art stays within 1 MiB and retains alpha/source provenance", () => {
  const root=new URL("../public/assets/maps/red-banner/modular/",import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL("manifest.json",root),"utf8"));
  assert.equal(manifest.assets.length,3);
  let total=0;
  for(const asset of manifest.assets) {
    const bytes=readFileSync(new URL(asset.filename,root));
    total+=bytes.length;
    const digest=createHash("sha256").update(bytes).digest("hex");
    assert.equal(bytes.toString("ascii",0,4),"RIFF");
    assert.equal(bytes.toString("ascii",8,12),"WEBP");
    assert.equal(bytes.readUInt32LE(4)+8,bytes.length);
    assert.equal(digest,asset.sha256);
    assert.ok(asset.filename.includes("."+digest.slice(0,12)+".webp"));
    assert.ok(Object.values(MAP_ASSET_FILES).includes("modular/"+asset.filename));
    assert.equal(bytes.length,asset.file_bytes);
    const original=readFileSync(new URL("../"+asset.source,import.meta.url));
    assert.equal(createHash("sha256").update(original).digest("hex"),asset.source_sha256);
    const chunks=[];
    for(let offset=12;offset+8<=bytes.length;) {
      chunks.push(bytes.toString("ascii",offset,offset+4));
      const length=bytes.readUInt32LE(offset+4);
      offset+=8+length+(length%2);
    }
    assert.equal(chunks.includes("ALPH"),asset.has_alpha);
    if(asset.has_alpha)assert.equal(asset.alpha_matches_resized_source,true);
  }
  assert.equal(total,manifest.runtime_total_bytes);
  assert.ok(total<=1024*1024,"Core map art exceeds download budget");
  for(const name of ["ground-grass.png","tree-spruce.png","cliff-moss.png"])
    assert.equal(existsSync(new URL(name,root)),false,"Raw PNG should not ship: "+name);
});
