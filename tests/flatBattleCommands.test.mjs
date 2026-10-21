import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {flatBattleCommands,skillSubmenuCommands} from "../src/scene/flatBattleCommands.ts";

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
 assert.ok(spells.some(c=>c.key==="status-1-burn"&&c.action==="support"));
 assert.ok(spells.some(c=>c.key==="status-0-mark"));
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
test("Board UI uses two menu layers and directly equips selected skill",()=>{
 const view=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
 assert.match(view,/command\.action==="submenu"/);
 assert.match(view,/this\.commandSubmenu=command\.group==="art"\?"art":"magic"/);
 assert.match(view,/skillSubmenuCommands\(this\.battle,actor,this\.commandSubmenu\)/);
 assert.match(view,/this\.battle\.equipWeapon\(actor,command\.weaponIndex\)/);
 assert.match(view,/this\.commandSubmenu=null;this\.refresh\(\)/);
});
