import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Battle} from "../src/engine/battle.ts";
import {CAMP_SHOP_STOCK,shopPrice} from "../src/engine/campShop.ts";
import {WEAPON_LIBRARY,MAX_INVENTORY} from "../src/engine/weapons.ts";
import {readCampaignJson} from "../src/engine/campaign.ts";

const prep=(gold=500)=>{const b=new Battle({campaign:true});b.preparationFunds.gold=gold;return b;};

test("E1-1 finite stock and positive price exclude commander and invented goods",()=>{
 assert.equal(new Set(CAMP_SHOP_STOCK).size,CAMP_SHOP_STOCK.length);
 for(const id of CAMP_SHOP_STOCK){
   assert.ok(Object.hasOwn(WEAPON_LIBRARY,id));
   assert.ok(Number.isSafeInteger(shopPrice(id))&&shopPrice(id)>0);
 }
 assert.equal(CAMP_SHOP_STOCK.includes("command-sword"),false);
 assert.equal(shopPrice("command-sword"),null);
});
test("Purchase deducts gold once, appends a new physical instance without re-equipping",()=>{
 const b=prep(),a=b.units.find(u=>u.id==="a1");
 const n=a.inventory.length,prior=JSON.stringify(a.weaponInstances);
 let changes=0;b.onChange=()=>changes++;
 assert.equal(b.shopQuote("a1","iron-sword").price,70);
 assert.equal(b.shopQuote("a1","iron-sword").slot,n);
 assert.equal(b.prepareBuyWeapon("a1","iron-sword"),true);
 assert.equal(a.inventory[n],"iron-sword");
 assert.deepEqual(a.weaponInstances[n],{
  instanceId:"a1:"+n+":iron-sword",weaponId:"iron-sword",durability:24,maxDurability:24,
 });
 assert.equal(JSON.stringify(a.weaponInstances.slice(0,n)),prior);
 assert.equal(a.equippedIndex,0);
 assert.equal(b.preparationFunds.gold,430);
 assert.equal(changes,1);
 const saved=readCampaignJson(JSON.stringify(b.campaignSnapshot()));
 assert.ok(saved);
 const restored=new Battle({campaign:true,save:saved});
 assert.equal(restored.preparationFunds.gold,430);
 assert.equal(restored.units.find(u=>u.id==="a1").inventory[n],"iron-sword");
 assert.deepEqual(restored.units.find(u=>u.id==="a1").weaponInstances[n],a.weaponInstances[n]);
 assert.equal(restored.prepareEquipWeapon("a1",n),true);
 assert.equal(restored.units.find(u=>u.id==="a1").equippedIndex,n);
 assert.equal(restored.beginSortie(),true);
 assert.equal(restored.prepareBuyWeapon("a1","iron-sword"),false);
 restored.restart();
 assert.equal(restored.campaignStage,"preparation");
 assert.equal(restored.units.find(u=>u.id==="a1").inventory[n],"iron-sword");
 assert.equal(restored.preparationFunds.gold,430);
});
test("Class, rank, money and catalog permissions cannot be circumvented",()=>{
 const b=prep(),a=b.units.find(u=>u.id==="a1");
 assert.match(b.shopQuote("a1","iron-lance").reason,/职业/);
 assert.equal(b.prepareBuyWeapon("a1","iron-lance"),false);
 assert.equal(b.prepareBuyWeapon("e1","iron-sword"),false);
 assert.equal(b.prepareBuyWeapon("a1","command-sword"),false);
 assert.equal(b.prepareBuyWeapon("a1","invalid"),false);
 assert.equal(b.changeClass("a1","axeFighter"),true);
 assert.match(b.shopQuote("a1","steel-axe").reason,/熟练度/);
 assert.equal(b.prepareBuyWeapon("a1","steel-axe"),false);
 b.preparationFunds.gold=20;
 assert.match(b.shopQuote("a1","iron-axe").reason,/金币/);
 const before=JSON.stringify(b.campaignSnapshot());
 assert.equal(b.prepareBuyWeapon("a1","iron-axe"),false);
 assert.equal(JSON.stringify(b.campaignSnapshot()),before);
 assert.equal(a.inventory.length,4);
});
test("Full inventory preserves equipped weapon and replaceable training-loaner slot",()=>{
 const b=prep(1000),a=b.units.find(u=>u.id==="a1");
 assert.equal(b.changeClass("a1","brawler"),true);
 const loaner=a.trainingSlot;
 assert.ok(loaner!==null);
 const original=a.inventory[loaner],instance=JSON.stringify(a.weaponInstances[loaner]);
 for(let i=a.inventory.length;i<MAX_INVENTORY;i++)
   assert.equal(b.prepareBuyWeapon("a1","training-gauntlet"),true);
 const size=a.inventory.length,gold=b.preparationFunds.gold;
 assert.equal(b.shopQuote("a1","training-gauntlet").slot,null);
 assert.equal(b.prepareBuyWeapon("a1","training-gauntlet"),false);
 assert.equal(a.inventory.length,size);
 assert.equal(a.inventory[loaner],original);
 assert.equal(JSON.stringify(a.weaponInstances[loaner]),instance);
 assert.equal(b.preparationFunds.gold,gold);
});
test("Spell scroll purchase creates legal null durability and charges; no duplicate scroll",()=>{
 const b=prep(),a=b.units.find(u=>u.id==="a4");
 assert.equal(b.shopQuote("a4","fire-tome").canBuy,false,
   "already-owned spells share a single charge pool");
 assert.equal(b.prepareBuyWeapon("a4","fire-tome"),false);
 assert.equal(b.changeClass("a4","acolyte"),true);
 const n=a.inventory.length;
 assert.equal(b.shopQuote("a4","light-bolt").canBuy,true);
 assert.equal(b.prepareBuyWeapon("a4","light-bolt"),true);
 assert.equal(a.inventory[n],"light-bolt");
 assert.equal(a.weaponInstances[n],null);
 assert.equal(a.spellCharges["light-bolt"],5);
 assert.equal(b.preparationFunds.gold,400);
 assert.equal(b.shopQuote("a4","light-bolt").canBuy,false);
 assert.equal(b.prepareBuyWeapon("a4","light-bolt"),false);
 const saved=readCampaignJson(JSON.stringify(b.campaignSnapshot()));
 assert.ok(saved);
 const restored=new Battle({campaign:true,save:saved});
 assert.equal(restored.units.find(u=>u.id==="a4").spellCharges["light-bolt"],5);
});
test("Non-campaign and in-battle purchases are always denied",()=>{
 const b=prep(),lab=new Battle({lab:true});
 assert.equal(lab.shopQuote("a1","iron-sword"),null);
 assert.equal(lab.prepareBuyWeapon("a1","iron-sword"),false);
 assert.equal(b.beginSortie(),true);
 assert.equal(b.shopQuote("a1","iron-sword"),null);
 assert.equal(b.prepareBuyWeapon("a1","iron-sword"),false);
 assert.equal(b.preparationFunds.gold,500);
});
test("Real shop UI delegates quote and payment to the engine",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");
 assert.match(html,/id="campaign-shop-panel"/);
 assert.match(html,/id="campaign-shop-list"/);
 assert.match(html,/id="campaign-shop-summary"/);
 assert.match(main,/shopQuote\(selected\.id,id\)/);
 assert.match(main,/prepareBuyWeapon\(selected\.id,id\)/);
});
