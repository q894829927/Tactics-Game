import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Battle } from "../src/engine/battle.ts";
import { WEAPON_LIBRARY, MAX_INVENTORY, weaponFor, canWield } from "../src/engine/weapons.ts";

test("catalog and starting inventories have valid role-limited weapons",()=>{
 const battle=new Battle();
 assert.ok(Object.keys(WEAPON_LIBRARY).length>=14);
 for(const unit of battle.units){
   assert.ok(unit.inventory.length>=2 && unit.inventory.length<=MAX_INVENTORY);
   assert.equal(unit.equippedIndex,0);
   assert.ok(unit.inventory.every(id=>canWield(unit.classId,id,unit.weaponExp)));
   assert.deepEqual(unit.weapon,weaponFor(unit.inventory[0]));
 }
});

test("equipping changes damage, weapon weight, attack speed and hit without consuming action",()=>{
 const b=new Battle(),a=b.units.find(u=>u.id==="a1"),e=b.units.find(u=>u.id==="e1");
 a.x=5;a.y=1;e.x=6;e.y=1;b.click(5,1);
 const start={damage:b.damage(a,e),as:b.combatStats(a).attackSpeed,
    hit:b.combatStats(a).hit,log:b.log.length};
 assert.equal(b.equipWeapon(a,1),true);
 assert.equal(a.weapon.name,"钢剑");
 assert.ok(b.damage(a,e)>start.damage);
 assert.ok(b.combatStats(a).attackSpeed<start.as);
 assert.ok(b.combatStats(a).hit<start.hit);
 assert.equal(a.spent,false);assert.equal(a.moved,false);assert.equal(a.acted,false);
 assert.equal(b.log.length,start.log);
 assert.equal(b.equipWeapon(a,0),true);
 assert.equal(b.damage(a,e),start.damage);
});

test("different weapon range controls targeting, counter and enemy threats",()=>{
 const b=new Battle(),l=b.units.find(u=>u.id==="a2"),e=b.units.find(u=>u.id==="e1");
 l.x=4;l.y=4;e.x=6;e.y=4;b.click(4,4);
 assert.equal(b.inAttackRange(l,e),false);
 assert.equal(b.availableAttackWeapons(l).includes(2),true);
 assert.equal(b.equipWeapon(l,2),true);
 assert.equal(l.weapon.name,"投枪");
 assert.equal(l.minRange,1);assert.equal(l.maxRange,2);
 assert.equal(b.inAttackRange(l,e),true);
 assert.equal(b.forecastAttack(l,e).canCounter,false);
 b.click(6,4);
 assert.equal(l.spent,true);
 assert.equal(b.log.length,1);
 assert.equal(b.lastCombatEvents[0].toId,e.id);
});

test("bow minimum range changes on equipping long bow, including valid/invalid targets",()=>{
 const b=new Battle(),a=b.units.find(u=>u.id==="a3"),e=b.units.find(u=>u.id==="e1");
 a.x=4;a.y=4;e.x=6;e.y=4;b.click(4,4);
 assert.equal(b.inAttackRange(a,e),true);
 assert.equal(b.equipWeapon(a,2),true);
 assert.equal(a.weapon.name,"长弓");
 assert.equal(b.inAttackRange(a,e),false);
 e.x=7;e.y=4;
 assert.equal(b.inAttackRange(a,e),true);
 assert.equal(b.forecastAttack(a,e)?.canCounter,false);
});

test("cannot equip enemy, ally after wait, invalid index or incompatible injected item",()=>{
 const b=new Battle(),a=b.units.find(u=>u.id==="a1"),e=b.units.find(u=>u.id==="e1");
 assert.equal(b.equipWeapon(a,1),false); // no ally selection
 b.click(a.x,a.y);
 assert.equal(b.equipWeapon(e,1),false);
 assert.equal(b.equipWeapon(a,99),false);
 assert.equal(b.equipWeapon(a,-1),false);
 const original=a.weapon.name;
 a.inventory.push("long-bow");
 assert.equal(b.equipWeapon(a,3),false);
 assert.equal(a.weapon.name,original);
 a.inventory.pop();
 b.waitSelected();
 assert.equal(b.equipWeapon(a,1),false);
 b.beginEnemyTurn();
 assert.equal(b.equipWeapon(a,1),false);
});

test("changing equipment preserves movable origin and reset restores default",()=>{
 const b=new Battle(),a=b.units.find(u=>u.id==="a1");
 b.click(1,5);b.click(2,5);
 assert.equal(b.canCancelMove,true);
 assert.equal(b.equipWeapon(a,1),true);
 assert.equal(b.cancelMove(),true);
 assert.deepEqual({x:a.x,y:a.y},{x:1,y:5});
 assert.equal(a.weapon.name,"钢剑"); // reversible movement is independent of equipment
 assert.equal(b.log.length,0);
 b.restart();
 const fresh=b.units.find(u=>u.id==="a1");
 assert.equal(fresh.weapon.name,"铁剑");
 assert.equal(fresh.equippedIndex,0);
});

test("UI uses current equipment for attack and an actual inline battle bag submenu",()=>{
 const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 const flat=readFileSync(new URL("../src/scene/flatBattleCommands.ts",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(flat,/availableAttackWeapons\(actor\)\.includes\(actor\.equippedIndex\)/);
 assert.match(board,/command\.action==="attack"/);
 assert.match(board,/command.action==="equip"/);
 assert.match(board,/inventorySubmenuCommands\(actor\)/);
 assert.match(board,/this\.battle\.forecastAttack\(selected, target,\s*this\.attackArtId\?\?undefined\)/);
 assert.match(board,/this\.battle\.click\(target\.x,target\.y\)/);
 assert.match(main,/battle\.equipWeapon\(selected,index\)/);
 assert.doesNotMatch(main,/board\.onInventoryRequested=/);
 assert.match(html,/id="inventory-list"/);
 assert.match(html,/id="forecast-ally-weapon"/);
 assert.match(html,/id="forecast-enemy-weapon"/);
});
