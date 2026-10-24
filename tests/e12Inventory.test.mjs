import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {readCampaignJson,parseCampaign} from "../src/engine/campaign.ts";
import {WAREHOUSE_CAPACITY,sellWeaponValue} from "../src/engine/campInventory.ts";

const prepared=(gold=0)=>{const b=new Battle({campaign:true});b.preparationFunds.gold=gold;return b;};
const ally=(b,id="a1")=>b.units.find(u=>u.id===id);

test("old schema=1 saves migrate to empty safe warehouse without resetting progress",()=>{
 const b=prepared(207);
 const legacy=b.campaignSnapshot();
 delete legacy.warehouse;delete legacy.warehouseSerial;
 const parsed=readCampaignJson(JSON.stringify(legacy));
 assert.ok(parsed);
 assert.deepEqual(parsed.warehouse,[]);
 assert.equal(parsed.warehouseSerial,0);
 assert.equal(parsed.funds.gold,207);
 assert.deepEqual(parsed.allies[0].inventory,b.campaignSnapshot().allies[0].inventory);
 const restored=new Battle({campaign:true,save:parsed});
 assert.equal(restored.preparationFunds.gold,207);
 assert.deepEqual(restored.warehouse,[]);
});
test("deposit and withdrawal preserve durability, equip adjustment, serial and save",()=>{
 const b=prepared(),a=ally(b);
 a.weaponInstances[1].durability=9;
 assert.equal(b.prepareDepositWeapon("a1",1),true);
 assert.equal(a.inventory.length,2);
 assert.equal(b.warehouse.length,1);
 assert.equal(b.warehouse[0].weaponId,"steel-sword");
 assert.equal(b.warehouse[0].instance.durability,9);
 const ticket=b.warehouse[0].entryId;
 assert.equal(b.prepareWithdrawWeapon("a2",ticket),true);
 assert.equal(b.warehouse.length,0);
 assert.equal(ally(b,"a2").inventory.at(-1),"steel-sword");
 assert.equal(ally(b,"a2").weaponInstances.at(-1).durability,9);
 assert.equal(b.warehouseSerial,ticket);
 const doc=readCampaignJson(JSON.stringify(b.campaignSnapshot()));
 assert.ok(doc);
 const loaded=new Battle({campaign:true,save:doc});
 assert.equal(ally(loaded,"a2").inventory.at(-1),"steel-sword");
 assert.equal(ally(loaded,"a2").weaponInstances.at(-1).durability,9);
 assert.equal(loaded.beginSortie(),true);
 assert.equal(loaded.prepareDepositWeapon("a2",0),false);
 loaded.restart();
 assert.equal(ally(loaded,"a2").inventory.at(-1),"steel-sword");
});
test("equipped weapon removal selects a different legal weapon without corrupting slot",()=>{
 const b=prepared(),a=ally(b);
 assert.equal(b.prepareDepositWeapon("a1",0),true);
 assert.equal(a.equippedIndex,0);
 assert.equal(a.inventory[0],"steel-sword");
 assert.equal(a.weapon.name,"钢剑");
 assert.equal(b.prepareDepositWeapon("a1",0),true);
 assert.equal(a.inventory.length,1);
 assert.equal(a.inventory[0],"slim-sword");
 assert.equal(b.prepareDepositWeapon("a1",0),false);
 assert.equal(b.prepareSellInventory("a1",0),false);
 assert.equal(b.beginSortie(),true);
});
test("sale price depends on durability and never exceeds half purchase price",()=>{
 const b=prepared(),a=ally(b),w=a.weaponInstances[0];
 assert.equal(sellWeaponValue("iron-sword",w),35);
 w.durability=12;
 assert.equal(sellWeaponValue("iron-sword",w),17);
 w.durability=0;
 assert.equal(sellWeaponValue("iron-sword",w),0);
 assert.equal(sellWeaponValue("command-sword",w),null);
 assert.equal(sellWeaponValue("fire-tome",null),47);
});
test("sell inventory and warehouse once, no item duplication or double credits",()=>{
 const b=prepared(),a=ally(b);
 a.weaponInstances[2].durability=12;
 assert.equal(b.prepareSellInventory("a1",2),true);
 assert.equal(b.preparationFunds.gold,30);
 assert.equal(b.prepareDepositWeapon("a1",1),true);
 const entry=b.warehouse[0].entryId;
 const beforeGold=b.preparationFunds.gold;
 assert.equal(b.prepareSellWarehouse(entry),true);
 assert.equal(b.preparationFunds.gold,beforeGold+92);
 assert.equal(b.prepareSellWarehouse(entry),false);
 assert.equal(b.preparationFunds.gold,beforeGold+92);
 assert.equal(b.warehouse.length,0);
 const saved=readCampaignJson(JSON.stringify(b.campaignSnapshot()));
 assert.ok(saved);
 assert.equal(saved.funds.gold,b.preparationFunds.gold);
});
test("training loaner cannot be stored or sold and its index shifts safely",()=>{
 const b=prepared(),a=ally(b);
 assert.equal(b.changeClass("a1","brawler"),true);
 const old=a.trainingSlot;
 assert.ok(old!==null);
 assert.equal(b.prepareDepositWeapon("a1",old),false);
 assert.equal(b.prepareSellInventory("a1",old),false);
 // Need to keep the equipped gauntlet while removing old sword slots.
 assert.equal(b.prepareDepositWeapon("a1",0),true);
 assert.equal(a.trainingSlot,old-1);
 assert.equal(b.prepareDepositWeapon("a1",0),true);
 assert.equal(a.trainingSlot,old-2);
 assert.equal(a.inventory[a.trainingSlot],"training-gauntlet");
 assert.equal(b.beginSortie(),true);
});
test("warehouse storage and transfer block full capacity and stale entry references",()=>{
 const b=prepared(1000),a=ally(b);
 // Other owned weapons may be moved out, while one equippable remains.
 assert.equal(b.prepareDepositWeapon("a1",1),true);
 const entry=b.warehouse[0].entryId;
 assert.equal(b.prepareWithdrawWeapon("a1",entry+1),false);
 assert.equal(b.prepareWithdrawWeapon("e1",entry),false);
 // A stale ID must not resolve to an item inserted later in same list position.
 assert.equal(b.prepareWithdrawWeapon("a1",entry),true);
 assert.equal(b.prepareWithdrawWeapon("a1",entry),false);
 assert.equal(b.warehouse.length,0);
 const state=JSON.stringify(b.campaignSnapshot());
 for(let i=0;i<WAREHOUSE_CAPACITY;i++)b.warehouse.push({
  entryId:i+1,weaponId:"iron-sword",
  instance:{instanceId:"test:"+i,weaponId:"iron-sword",durability:24,maxDurability:24},
  charges:null,
 });
 b.warehouseSerial=WAREHOUSE_CAPACITY;
 assert.equal(b.prepareDepositWeapon("a1",1),false);
 assert.equal(JSON.stringify(a.inventory),JSON.stringify(JSON.parse(state).allies[0].inventory));
});
test("magic moves carry current charges; duplicate scrolls and incompatible equips rejected",()=>{
 const b=prepared(),mage=ally(b,"a4");
 mage.spellCharges["fire-tome"]=3;
 assert.equal(b.prepareDepositWeapon("a4",0),true);
 assert.equal(b.warehouse[0].charges,3);
 assert.equal(mage.spellCharges["fire-tome"],undefined);
 const entry=b.warehouse[0].entryId;
 // Cannot withdraw magic to an owner who already holds this same scroll.
 assert.equal(b.prepareWithdrawWeapon("a4",entry),true);
 assert.equal(mage.spellCharges["fire-tome"],3);
 const c=b.warehouseSerial;
 assert.equal(c,entry);
 assert.equal(b.prepareDepositWeapon("a4",mage.inventory.indexOf("fire-tome")),true);
 assert.equal(b.prepareWithdrawWeapon("a1",b.warehouse[0].entryId),true);
 assert.equal(ally(b,"a1").spellCharges["fire-tome"],3);
 // Sword class can carry it for future reclass, but equip remains blocked.
 assert.equal(b.prepareEquipWeapon("a1",ally(b,"a1").inventory.length-1),false);
});
test("malformed warehouse or duplicate IDs are rejected; no resource duplication",()=>{
 const b=prepared(60),raw=b.campaignSnapshot();
 const item={entryId:1,weaponId:"iron-sword",
  instance:{instanceId:"fake",weaponId:"iron-sword",durability:24,maxDurability:24},
  charges:null};
 raw.warehouse=[item,item];raw.warehouseSerial=1;
 assert.equal(parseCampaign(raw),null);
 raw.warehouse=[{...item,instance:{...item.instance,durability:999}}];
 assert.equal(parseCampaign(raw),null);
 raw.warehouse=[item];raw.warehouseSerial=0;
 assert.equal(parseCampaign(raw),null);
 raw.warehouseSerial=1;
 assert.ok(parseCampaign(raw));
});
test("lab/in-battle/settlement rejects all inventory economy actions",()=>{
 const lab=new Battle({lab:true}),b=prepared();
 assert.equal(lab.prepareDepositWeapon("a1",0),false);
 assert.equal(lab.prepareSellInventory("a1",0),false);
 assert.equal(lab.prepareWithdrawWeapon("a1",1),false);
 assert.equal(lab.prepareSellWarehouse(1),false);
 assert.equal(b.beginSortie(),true);
 assert.equal(b.prepareDepositWeapon("a1",0),false);
 assert.equal(b.prepareSellInventory("a1",0),false);
 assert.equal(b.prepareWithdrawWeapon("a1",1),false);
 assert.equal(b.prepareSellWarehouse(1),false);
});
test("E1-2 UI contains inventory and shared storage management actions",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 assert.match(html,/id="campaign-inventory-panel"/);
 assert.match(html,/id="campaign-warehouse-list"/);
 assert.match(html,/id="campaign-bag-manage-list"/);
 assert.match(main,/prepareDepositWeapon\(selected\.id,index\)/);
 assert.match(main,/prepareWithdrawWeapon\(selected\.id,entry\.entryId\)/);
 assert.match(main,/prepareSellInventory\(selected\.id,index\)/);
 assert.match(main,/prepareSellWarehouse\(entry\.entryId\)/);
});
