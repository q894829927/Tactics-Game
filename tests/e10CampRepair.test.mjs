import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {quoteWeaponRepair,repairUnitPrice} from "../src/engine/campRepair.ts";
import {readCampaignJson} from "../src/engine/campaign.ts";

function setup(gold=300){
 const b=new Battle({campaign:true});
 b.preparationFunds.gold=gold;
 return b;
}
test("E1-0 repair quotes distinguish physical ranks, damage and spells",()=>{
 const b=setup(),a=b.units.find(u=>u.id==="a1");
 const id=a.inventory[0],w=a.weaponInstances[0];
 assert.equal(repairUnitPrice("iron-sword"),2);
 assert.equal(repairUnitPrice("steel-sword"),4);
 assert.equal(repairUnitPrice("fire-tome"),0);
 assert.equal(quoteWeaponRepair(id,w),null);
 w.durability-=7;
 assert.deepEqual(quoteWeaponRepair(id,w),{
   weaponId:id,missing:7,unitPrice:2,cost:14,
 });
 assert.equal(quoteWeaponRepair(id,{...w,weaponId:"steel-sword"}),null);
 assert.equal(quoteWeaponRepair("healing-prayer",null),null);
});
test("Single repair deducts coins once, refreshes only requested physical instance",()=>{
 const b=setup(60),a=b.units.find(u=>u.id==="a1");
 a.weaponInstances[0].durability-=8;
 const before=a.weaponInstances[1].durability;
 let changed=0;b.onChange=()=>changed++;
 assert.equal(b.prepareRepairWeapon("a1",0),true);
 assert.equal(b.preparationFunds.gold,44);
 assert.equal(a.weaponInstances[0].durability,a.weaponInstances[0].maxDurability);
 assert.equal(a.weaponInstances[1].durability,before);
 assert.equal(changed,1);
 assert.equal(b.prepareRepairWeapon("a1",0),false);
 assert.equal(b.preparationFunds.gold,44);
 assert.equal(changed,1);
});
test("Insufficient coins or invalid index cannot create durability or debt",()=>{
 const b=setup(7),a=b.units.find(u=>u.id==="a1");
 a.weaponInstances[0].durability-=6;
 const initial=JSON.stringify(b.campaignSnapshot());
 assert.equal(b.prepareRepairWeapon("a1",0),false);
 assert.equal(b.prepareRepairWeapon("a1",99),false);
 assert.equal(b.prepareRepairWeapon("missing",0),false);
 assert.equal(b.prepareRepairWeapon("e1",0),false);
 assert.equal(JSON.stringify(b.campaignSnapshot()),initial);
 assert.equal(b.preparationFunds.gold,7);
});
test("Whole-party repair is atomic and uses all owned units, including offhand weapons",()=>{
 const b=setup(80),a=b.units.find(u=>u.id==="a1");
 const other=b.units.find(u=>u.id==="a2");
 a.weaponInstances[0].durability-=5;
 a.weaponInstances[1].durability-=3;
 other.weaponInstances[0].durability-=7;
 const expected=5*2+3*4+7*2;
 const before=b.partyRepairQuote();
 assert.equal(before.cost,expected);
 assert.equal(before.weapons,3);
 let emitted=0;b.onChange=()=>emitted++;
 assert.equal(b.prepareRepairAll(),true);
 assert.equal(b.preparationFunds.gold,80-expected);
 assert.equal(b.partyRepairQuote().cost,0);
 assert.equal(emitted,1);
 assert.equal(b.prepareRepairAll(),false);
 assert.equal(emitted,1);
});
test("Bulk repair refuses all spending when one combined quote is unaffordable",()=>{
 const b=setup(10),a=b.units.find(u=>u.id==="a1");
 a.weaponInstances[0].durability-=7;
 a.weaponInstances[1].durability-=7;
 const snapshot=JSON.stringify(b.campaignSnapshot());
 assert.equal(b.prepareRepairAll(),false);
 assert.equal(JSON.stringify(b.campaignSnapshot()),snapshot);
});
test("Repaired gear and remaining gold persist across reload, then battle restart",()=>{
 const b=setup(55),a=b.units.find(u=>u.id==="a1");
 a.weaponInstances[0].durability-=10;
 assert.equal(b.prepareRepairWeapon("a1",0),true);
 const json=JSON.stringify(b.campaignSnapshot());
 const restored=new Battle({campaign:true,save:readCampaignJson(json)});
 assert.equal(restored.preparationFunds.gold,35);
 assert.equal(restored.units.find(u=>u.id==="a1").weaponInstances[0].durability,24);
 assert.equal(restored.prepareRepairWeapon("a1",0),false);
 assert.equal(restored.beginSortie(),true);
 assert.equal(restored.prepareRepairAll(),false);
 restored.units.find(u=>u.id==="a1").weaponInstances[0].durability=1;
 restored.restart(); // Abandoned sortie must restore repaired camp checkpoint.
 assert.equal(restored.preparationFunds.gold,35);
 assert.equal(restored.units.find(u=>u.id==="a1").weaponInstances[0].durability,24);
 assert.equal(restored.campaignStage,"preparation");
});
test("Lab and non-campaign modes cannot spend or use campaign repairs",()=>{
 const lab=new Battle({lab:true,labPreset:"mixed"});
 const solo=new Battle();
 assert.equal(lab.prepareRepairWeapon("a1",0),false);
 assert.equal(lab.prepareRepairAll(),false);
 assert.equal(solo.prepareRepairWeapon("a1",0),false);
 assert.equal(solo.prepareRepairAll(),false);
});
test("Camp has a discoverable repair UI distinct from the weapon equip buttons",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 assert.match(html,/id="campaign-repair-panel"/);
 assert.match(html,/id="campaign-repair-list"/);
 assert.match(main,/prepareRepairWeapon\(selected\.id,index\)/);
 assert.match(main,/prepareRepairAll\(\)/);
});
