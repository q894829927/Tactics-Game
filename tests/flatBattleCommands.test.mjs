import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {flatBattleCommands} from "../src/scene/flatBattleCommands.ts";

const select=(preset,id="a1")=>{
 const b=new Battle({lab:true,labPreset:preset});
 const actor=b.units.find(u=>u.id===id);
 b.click(actor.x,actor.y);
 return {b,commands:flatBattleCommands(b,actor)};
};
test("Only six groups and no category or weapon submenu are exposed",()=>{
 const {commands}=select("mixed");
 assert.deepEqual([...new Set(commands.map(c=>c.group))],["attack","art","magic","inventory","wait"]);
 assert.ok(commands.some(c=>c.key==="inventory"&&c.enabled));
 assert.ok(commands.some(c=>c.key==="wait"&&c.enabled));
 assert.ok(commands.every(c=>!["equip","trade","status-menu"].includes(c.action)));
 assert.ok(commands.every(c=>!/试验|职业技|术法|交换|取消移动/.test(c.label)));
 assert.ok(!commands.some(c=>c.group==="undo"));
});
test("Undo appears only after a legal uncommitted movement",()=>{
 const b=new Battle({lab:true,labPreset:"mixed"});
 const a=b.units.find(u=>u.id==="a1");
 b.click(a.x,a.y);
 const dest=[...b.reachable(a).keys()].filter(k=>k!==a.x+","+a.y)[0];
 assert.ok(dest);
 const [x,y]=dest.split(",").map(Number);
 b.click(x,y);
 assert.equal(b.canCancelMove,true);
 const list=flatBattleCommands(b,a);
 assert.equal(list.at(-1)?.label,"撤销移动");
 assert.equal(list.at(-1)?.action,"undo");
 assert.equal(b.cancelMove(),true);
 assert.ok(!flatBattleCommands(b,a).some(c=>c.group==="undo"));
});
test("Skills and career moves have direct names instead of nested pickers",()=>{
 const {commands}=select("melee");
 const skills=commands.filter(c=>c.group==="art"&&c.action!=="none");
 assert.ok(skills.length>0);
 assert.ok(skills.every(c=>c.label.startsWith("战技 · ")&&c.artId));
});
test("Healing and shields are separately available with no submenus",()=>{
 const {commands}=select("support","a2");
 assert.ok(commands.some(c=>c.key==="support-heal"&&c.enabled&&c.label.includes("治愈术")));
 assert.ok(commands.some(c=>c.key==="support-shield"&&c.enabled));
});
test("Dark caster has direct spells and named status effects",()=>{
 const {commands}=select("support","a1");
 assert.ok(commands.some(c=>c.key==="status-burn"&&c.action==="support"));
 assert.ok(commands.some(c=>c.key==="status-mark"&&c.action==="support"));
 assert.ok(commands.some(c=>c.key==="spell-attack"&&c.group==="magic"));
});
test("BoardView commands go to target selection instead of a category picker",()=>{
 const view=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 const area=view.slice(view.indexOf("private activateFlatCommand("),view.indexOf("private renderWeaponPicker():"));
 assert.match(area,/flatBattleCommands/);
 assert.doesNotMatch(area,/this\\.pickerMode\\s*=\\s*"(attack|formal|career|art|status|equip)"/);
 assert.match(view,/onInventoryRequested/);
});
