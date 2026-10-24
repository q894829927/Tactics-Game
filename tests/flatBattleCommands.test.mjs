import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {flatBattleCommands,skillSubmenuCommands,inventorySubmenuCommands} from "../src/scene/flatBattleCommands.ts";

const select=(preset,id="a1")=>{
 const b=new Battle({lab:true,labPreset:preset});
 const actor=b.units.find(u=>u.id===id);
 b.click(actor.x,actor.y);
 return {b,actor,commands:flatBattleCommands(b,actor)};
};
test("Top-level commands are the exact five or six requested categories",()=>{
 const {commands}=select("support");
 assert.deepEqual(commands.map(c=>c.label),["攻击","战技","法术","背包","待机"]);
 assert.equal(commands.find(c=>c.key==="art").action,"submenu");
 assert.equal(commands.find(c=>c.key==="magic").action,"submenu");
 assert.equal(commands.find(c=>c.key==="inventory").action,"submenu");
 assert.equal(commands.filter(c=>c.group==="art").length,1);
 assert.equal(commands.filter(c=>c.group==="magic").length,1);
 assert.ok(commands.every(c=>!/试验|职业技|术法|交换|取消移动/.test(c.label)));
});
test("Undo appears only after legal uncommitted movement",()=>{
 const {b,actor}=select("mixed");
 const dest=[...b.reachable(actor).keys()].filter(k=>k!==actor.x+","+actor.y)[0];
 assert.ok(dest);
 const [x,y]=dest.split(",").map(Number);
 b.click(x,y);
 assert.equal(b.canCancelMove,true);
 const commands=flatBattleCommands(b,actor);
 assert.deepEqual(commands.map(c=>c.label),["攻击","战技","法术","背包","待机","撤销移动"]);
 assert.equal(b.cancelMove(),true);
 assert.ok(!flatBattleCommands(b,actor).some(c=>c.group==="undo"));
});
test("Art submenu lists normal, formal, and career skills with no third-level categories",()=>{
 const {b,actor}=select("melee");
 const arts=skillSubmenuCommands(b,actor,"art");
 assert.ok(arts.some(c=>c.artId===b.basicArt.id));
 assert.ok(arts.some(c=>c.action==="career"));
 assert.ok(arts.every(c=>c.action!=="submenu"&&c.group==="art"));
 assert.ok(arts.every(c=>!c.label.startsWith("战技 · ")));
 assert.ok(arts.some(c=>c.label==="强击"));
});
test("Spell submenu lists ALL compatible owned spells, including unequipped",()=>{
 const {b,actor}=select("support","a1");
 const spells=skillSubmenuCommands(b,actor,"magic");
 assert.ok(spells.some(c=>c.label==="火焰术"&&c.weaponIndex===0));
 assert.ok(spells.some(c=>c.label==="雷电术"&&c.weaponIndex===1));
 assert.equal(spells.filter(c=>c.effect==="burn"&&c.action==="support").length,1);
 assert.equal(spells.filter(c=>c.effect==="mark").length,1);
 assert.ok(spells.every(c=>c.action!=="submenu"&&c.group==="magic"));
});
test("White magic has actual heal, shield and attack choices across inventory",()=>{
 const {b,actor}=select("support","a2");
 const spells=skillSubmenuCommands(b,actor,"magic");
 assert.ok(spells.some(c=>c.key==="support-0-heal"&&c.enabled));
 assert.ok(spells.some(c=>c.key==="support-0-shield"&&c.enabled));
 assert.ok(spells.some(c=>c.key==="spell-1"&&c.label==="光矢术"));
});
test("Selected spell can equip the owned source weapon and use normal targeting",()=>{
 const {b,actor}=select("support","a1");
 const spells=skillSubmenuCommands(b,actor,"magic");
 const thunder=spells.find(c=>c.key==="spell-1");
 assert.equal(thunder.weaponIndex,1);
 assert.equal(actor.equippedIndex,0);
 assert.equal(b.equipWeapon(actor,thunder.weaponIndex),true);
 assert.equal(actor.weapon.name,"雷电术");
 assert.equal(actor.spent,false);
});
test("Insufficient spell charges disable casting without consuming an action",()=>{
 const {b,actor}=select("support","a1");
 const spell=skillSubmenuCommands(b,actor,"magic").find(c=>c.key==="spell-1");
 actor.spellCharges["thunder-tome"]=0;
 const retry=skillSubmenuCommands(b,actor,"magic").find(c=>c.key==="spell-1");
 assert.equal(retry.enabled,false);
 assert.equal(actor.spent,false);
 assert.equal(spell.weaponIndex,retry.weaponIndex);
});
test("Multiple lances show each named art once, including career skill and 强击",()=>{
 const {b,actor}=select("melee","a2");
 const skills=skillSubmenuCommands(b,actor,"art");
 assert.equal(skills.filter(c=>c.label==="拦截刺").length,1);
 assert.equal(skills.filter(c=>c.label==="强击").length,1);
 assert.equal(new Set(skills.map(c=>c.label)).size,skills.length);
});
test("If one duplicate weapon has no durability, choose another usable one",()=>{
 const {b,actor}=select("melee","a2");
 // The first lance is depleted, while the second lance can perform the art.
 actor.weaponInstances[0].durability=1;
 const foe=b.units.find(u=>u.id==="e1");
 foe.x=2;foe.y=6;
 const skills=skillSubmenuCommands(b,actor,"art");
 const power=skills.find(c=>c.artId===b.basicArt.id);
 const intercept=skills.find(c=>c.label==="拦截刺");
 assert.equal(power?.enabled,true);
 assert.equal(power?.weaponIndex,1);
 assert.equal(intercept?.enabled,true);
 assert.equal(intercept?.weaponIndex,1);
});
test("Duplicate copies of a spell and status effects remain single commands",()=>{
 const {b,actor}=select("support","a1");
 actor.inventory.push("fire-tome");
 actor.weaponInstances.push(null);
 const spells=skillSubmenuCommands(b,actor,"magic");
 assert.equal(spells.filter(c=>c.label==="火焰术").length,1);
 assert.equal(spells.filter(c=>c.label==="雷电术").length,1);
 assert.equal(spells.filter(c=>c.effect==="burn").length,1);
 assert.equal(spells.filter(c=>c.effect==="mark").length,1);
});
test("Deduplicated spells prefer a castable source over exhausted current slot",()=>{
 const {b,actor}=select("support","a2");
 actor.inventory.push("healing-prayer");
 actor.weaponInstances.push(null);
 const heals=skillSubmenuCommands(b,actor,"magic").filter(c=>c.effect==="heal");
 assert.equal(heals.length,1);
 assert.ok(heals[0].enabled);
});
test("Board UI uses two menu layers and directly equips selected skill",()=>{
 const view=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 assert.match(view,/command\.action==="submenu"/);
 assert.ok(view.includes('this.commandSubmenu=command.group==="art"?"art":'));
 assert.ok(view.includes('command.group==="magic"?"magic":"inventory"'));
 assert.ok(view.includes("inventorySubmenuCommands(actor)"));
 assert.match(view,/skillSubmenuCommands\(this\.battle,actor,this\.commandSubmenu\)/);
 assert.match(view,/this\.battle\.equipWeapon\(actor,command\.weaponIndex\)/);
 assert.match(view,/this\.commandSubmenu=null;this\.refresh\(\)/);
});

test("Battle bag shows every owned weapon or spell once, preserving original slot order",()=>{
 const {actor}=select("support","a1");
 const options=inventorySubmenuCommands(actor);
 assert.deepEqual(options.map(c=>c.key),["gear-0","gear-1"]);
 assert.ok(options[0].label.includes("火焰术"));
 assert.ok(options[1].label.includes("雷电术"));
 assert.equal(options[0].action,"equip");
 assert.equal(options[1].weaponIndex,1);
 assert.equal(options[0].group,"inventory");
 assert.equal(options[1].enabled,true);
 assert.ok(options.every(c=>c.action!=="submenu"));
});
test("Equipping from in-battle bag is reversible and does not consume action",()=>{
 const {b,actor}=select("support","a1");
 const [first,second]=inventorySubmenuCommands(actor);
 assert.ok(first.label.startsWith("◆"));
 assert.equal(second.weaponIndex,1);
 assert.equal(b.equipWeapon(actor,second.weaponIndex),true);
 const options=inventorySubmenuCommands(actor);
 assert.ok(options[1].label.startsWith("◆"));
 assert.ok(!options[0].label.startsWith("◆"));
 assert.equal(actor.weapon.name,"雷电术");
 assert.equal(actor.spent,false);
 assert.equal(actor.moved,false);
 assert.equal(actor.acted,false);
 assert.equal(b.equipWeapon(actor,first.weaponIndex),true);
 assert.equal(actor.weapon.name,"火焰术");
});
test("Items unusable by current class are shown disabled, not silently equipped",()=>{
 const {b,actor}=select("mixed","a1");
 actor.inventory.push("fire-tome");
 actor.weaponInstances.push(null);
 const option=inventorySubmenuCommands(actor).at(-1);
 assert.equal(option.enabled,false);
 assert.match(option.hint,/职业或武器熟练度不足/);
 assert.equal(b.equipWeapon(actor,actor.inventory.length-1),false);
});
