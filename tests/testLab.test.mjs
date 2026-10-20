import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {LEVEL_IDS} from "../src/engine/levels.ts";
import {LAB_PRESETS,LAB_PRESET_IDS,LAB_LEVEL,LAB_TERRAIN} from "../src/engine/testLab.ts";
import {canWield} from "../src/engine/weapons.ts";

test("Lab is one mixed terrain map with four playable presets; chapter list unchanged",()=>{
 assert.equal(LAB_PRESET_IDS.length,4);
 assert.deepEqual(LEVEL_IDS,["chapter-1-1","chapter-1-2","chapter-1-3","chapter-1-4"]);
 assert.ok(new Set(LAB_TERRAIN.join("")).has("#"));
 for(const kind of [".","G","F","H","#"])assert.ok(LAB_TERRAIN.some(line=>line.includes(kind)));
 assert.equal(LAB_LEVEL.victory.kind,"defeat-unit");
 for(const preset of Object.values(LAB_PRESETS)){
  assert.equal(preset.allies.length,4);
  assert.equal(preset.enemies.length,6);
  assert.equal(new Set([...preset.allies,...preset.enemies].map(s=>s.x+","+s.y)).size,10);
 }
});
test("Lab fixtures offer legal equipment and skills without campaign persistence",()=>{
 for(const id of LAB_PRESET_IDS){
  const b=new Battle({lab:true,labPreset:id});
  assert.equal(b.labMode,true);
  assert.equal(b.campaignEnabled,false);
  assert.equal(b.campaignStage,"battle");
  assert.equal(b.currentLevel.id,"test-lab");
  assert.deepEqual(b.terrain,LAB_TERRAIN);
  assert.equal(b.units.length,10);
  assert.deepEqual(b.campaignSnapshot.bind(b) instanceof Function,true);
  assert.throws(()=>b.campaignSnapshot(),/Campaign is not enabled/);
  for(const u of b.units){
   assert.ok(canWield(u.classId,u.inventory[u.equippedIndex],u.weaponExp),id+":"+u.id);
   assert.ok(u.equippedArts.length<=2);
   assert.ok(u.classLicenses.includes(u.classId));
  }
  assert.equal(b.preparationFunds.gold,0);
  assert.equal(b.preparationFunds.vouchers.intermediate,0);
  assert.equal(b.completedLevelIds.length,0);
 }
});
test("Lab preset changes and restart restore initial conditions including injuries",()=>{
 const b=new Battle({lab:true,labPreset:"support"});
 const wounded=b.units.find(u=>u.id==="a3");
 assert.ok(wounded.hp<wounded.maxHp);
 const guarded=b.units.find(u=>u.id==="e1");
 assert.ok(guarded.statuses.some(s=>s.kind==="shield"));
 const original=JSON.stringify(b.units.map(u=>({x:u.x,y:u.y,hp:u.hp,job:u.classId,statuses:u.statuses})));
 b.click(1,5);b.waitSelected();assert.equal(b.units.find(u=>u.id==="a1").spent,true);
 b.restart();
 assert.equal(b.round,1);
 assert.equal(b.result,"playing");
 assert.equal(JSON.stringify(b.units.map(u=>({x:u.x,y:u.y,hp:u.hp,job:u.classId,statuses:u.statuses}))),original);
 assert.equal(b.selectLabPreset("movement"),true);
 assert.equal(b.labPreset,"movement");
 assert.equal(b.units.find(u=>u.id==="a1").classId,"roverCavalry");
 assert.equal(b.selectLabPreset("invalid-preset"),false);
 assert.equal(b.labPreset,"movement");
});
test("Lab battles never award campaign resources or unlock chapters",()=>{
 const b=new Battle({lab:true});
 b.units.find(u=>u.id==="e6").hp=0;
 b.beginEnemyTurn();
 assert.equal(b.result,"victory");
 assert.equal(b.pendingSettlement,null);
 assert.equal(b.preparationFunds.gold,0);
 assert.deepEqual(b.completedLevelIds,[]);
 b.restart();
 assert.equal(b.result,"playing");
 assert.equal(b.units.find(u=>u.id==="e6").hp>0,true);
});
test("Campaign entry still initializes original first stage and rejects lab preset",()=>{
 const b=new Battle({campaign:true});
 assert.equal(b.currentLevel.id,"chapter-1-1");
 assert.equal(b.selectLabPreset("support"),false);
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 for(const id of ["campaign-lab-entry","lab-toolbar","lab-preset","lab-reset","lab-exit"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(main,/new URLSearchParams\(window\.location\.search\)/);
 assert.match(main,/new Battle\(\{campaign:!isLab,lab:isLab/);
});
