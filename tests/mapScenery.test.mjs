import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { Battle } from "../src/engine/battle.ts";
import { buildMapScenery, riverBankX } from "../src/scene/mapScenery.ts";
import { TILE, WORLD_HEIGHT, TACTICAL_X, TACTICAL_Y, TACTICAL_WIDTH, TACTICAL_HEIGHT } from "../src/scene/worldGeometry.ts";
import { MAP_ASSET_FILES } from "../src/scene/mapAssetFiles.ts";

test("forest, hill and rock sprites stay inside their corresponding terrain cells", () => {
  const terrain=new Battle().terrain;
  const scenery=buildMapScenery(terrain);
  const inside=scenery.filter(s=>s.terrainCells.length);
  let count=0;
  for(let y=0;y<terrain.length;y++) for(let x=0;x<terrain[y].length;x++) {
    const type=terrain[y][x];
    const props=inside.filter(s=>s.terrainCells.some(cell=>cell.x===x&&cell.y===y));
    assert.equal(props.length,["F","H","#"].includes(type)?1:0,`${x},${y} ${type}`);
    for(const prop of props) {
      count++;
      if(type==="F") assert.ok([MAP_ASSET_FILES.tree,MAP_ASSET_FILES.treeBroadleaf].includes(prop.file));
      else assert.equal(prop.file,type==="H"?MAP_ASSET_FILES.hill:MAP_ASSET_FILES.cliff);
    }
  }
  assert.equal(inside.reduce((total,prop)=>total+prop.terrainCells.length,0),count);
  for(const prop of inside) {
    const xs=prop.terrainCells.map(cell=>cell.x),ys=prop.terrainCells.map(cell=>cell.y);
    assert.ok(prop.x>=TACTICAL_X+Math.min(...xs)*TILE);
    assert.ok(prop.x+prop.width<=TACTICAL_X+(Math.max(...xs)+1)*TILE);
    assert.ok(prop.y>=TACTICAL_Y+Math.min(...ys)*TILE);
    assert.ok(prop.y+prop.height<=TACTICAL_Y+(Math.max(...ys)+1)*TILE);
  }
  const cleared=terrain.map(row=>row.replace(/[FH#]/g,"."));
  assert.equal(buildMapScenery(cleared).filter(s=>s.terrainCells.length).length,0);
});

test("new forest variants and small woodland props are actually used without changing terrain", () => {
  const terrain=new Battle().terrain, before=[...terrain];
  const scenery=buildMapScenery(terrain);
  assert.deepEqual(terrain,before);
  for(const file of [MAP_ASSET_FILES.tree,MAP_ASSET_FILES.treeBroadleaf])
    assert.ok(scenery.some(prop=>prop.file===file&&prop.terrainCells.length),file);
  for(const file of [MAP_ASSET_FILES.shrub,MAP_ASSET_FILES.stones]) {
    const props=scenery.filter(prop=>prop.file===file);
    assert.ok(props.length>0,file);
    assert.ok(props.every(prop=>prop.terrainCells.length===0));
  }
  assert.equal(new Set(scenery.map(prop=>prop.id)).size,scenery.length);
});

test("a joined rock obstacle preserves blocked coverage and cannot bridge a walkable gap", () => {
  const scenery=buildMapScenery(new Battle().terrain);
  const rocks=scenery.filter(s=>s.file===MAP_ASSET_FILES.cliff && s.terrainCells.length);
  assert.equal(rocks.length,1);
  assert.deepEqual(rocks[0].terrainCells,[{x:3,y:2},{x:4,y:2}]);
  const separated=buildMapScenery(["...#.#...."]).filter(s=>s.file===MAP_ASSET_FILES.cliff && s.terrainCells.length);
  assert.equal(separated.length,2);
  for(const prop of separated) {
    assert.equal(prop.terrainCells.length,1);
    assert.ok(prop.width<TILE);
  }
});

test("decorations and water stay outside playable cells and scenery is stable", () => {
  const terrain=new Battle().terrain;
  const scenery=buildMapScenery(terrain);
  assert.deepEqual(scenery,buildMapScenery(terrain));
  for(const prop of scenery.filter(s=>!s.terrainCells.length)) {
    const overlaps=prop.x<TACTICAL_X+TACTICAL_WIDTH&&prop.x+prop.width>TACTICAL_X&&
      prop.y<TACTICAL_Y+TACTICAL_HEIGHT&&prop.y+prop.height>TACTICAL_Y;
    assert.equal(overlaps,false,prop.id);
  }
  // Include the stroke and scattered gravel, not only the water boundary.
  for(let y=0;y<=1104;y++)assert.ok(riverBankX(y)-25>TACTICAL_X+TACTICAL_WIDTH);
});

test("whole tree crowns and other props stay on land along the entire curved river", () => {
  const scenery=buildMapScenery(new Battle().terrain);
  // These six top-border trees were drawn partly or wholly over the water.
  for(const id of ["edge-tree-13-0","edge-tree-14-0","edge-tree-15-0",
    "edge-tree-13-1","edge-tree-14-1","edge-tree-15-1"])
    assert.equal(scenery.some(prop=>prop.id===id),false,id);
  assert.ok(scenery.some(prop=>prop.id==="edge-tree-12-0"),"Preserve landward top-border trees");
  assert.ok(scenery.some(prop=>prop.id==="edge-tree-12-10"),"Preserve landward bottom-border trees");
  for(const prop of scenery) {
    const right=prop.x+prop.width;
    for(let y=Math.max(0,Math.floor(prop.y));y<=Math.min(WORLD_HEIGHT,Math.ceil(prop.y+prop.height));y++)
      assert.ok(right<=riverBankX(y)-12,`${prop.id} reaches the river at y=${y}`);
  }
});

test("content-hashed runtime WebP art stays within 1 MiB and retains alpha/source provenance", () => {
  const root=new URL("../public/assets/maps/red-banner/modular/",import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL("manifest.json",root),"utf8"));
  assert.equal(manifest.assets.length,11);
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
