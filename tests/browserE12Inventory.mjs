/** E1-2: desktop and mobile real inventory deposits, cross-hero retrieval and sales. */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const url=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
const key="wildfield-tactics.campaign.v1";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const test of [
  {name:"desktop",viewport:{width:1366,height:768},isMobile:false},
  {name:"mobile",viewport:{width:390,height:844},isMobile:true},
 ]){
  const page=await browser.newPage({viewport:test.viewport,
    isMobile:test.isMobile,hasTouch:test.isMobile,deviceScaleFactor:1});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",dialog=>dialog.accept());
  assert.equal((await page.goto(url,{waitUntil:"networkidle",timeout:60000}))?.status(),200);
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),true);
  await page.locator("#campaign-equipment button").first().click();
  const initial=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(initial.schema,1);
  initial.funds.gold=100;
  initial.allies[0].weaponInstances[1].durability=9;
  await page.evaluate(([k,data])=>localStorage.setItem(k,JSON.stringify(data)),[key,initial]);
  await page.reload({waitUntil:"networkidle"});
  const pane=page.locator("#campaign-inventory-panel");
  await pane.locator("summary").click();
  assert.equal(await page.locator("#campaign-warehouse-count").innerText(),"0/40");
  // a1 deposits its partly used steel sword; class remains legally equipped.
  await page.locator('[data-entry-key="bag-1"] button[data-action="deposit"]').click();
  assert.equal(await page.locator("#campaign-warehouse-count").innerText(),"1/40");
  assert.equal(await page.locator("#campaign-equipment button").count(),2);
  let save=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(save.warehouse.length,1);
  assert.equal(save.warehouse[0].weaponId,"steel-sword");
  assert.equal(save.warehouse[0].instance.durability,9);
  const firstId=save.warehouse[0].entryId;
  // Persist warehouse before withdrawal, also proving migration survives reload.
  await page.reload({waitUntil:"networkidle"});
  await page.locator("#campaign-inventory-panel summary").click();
  assert.equal(await page.locator("#campaign-warehouse-count").innerText(),"1/40");
  await page.locator("#campaign-roster button").nth(1).click();
  await page.locator('[data-entry-key="'+firstId+'"] button[data-action="withdraw"]').click();
  save=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(save.warehouse.length,0);
  assert.equal(save.allies[1].inventory.at(-1),"steel-sword");
  assert.equal(save.allies[1].weaponInstances.at(-1).durability,9);
  assert.equal(save.allies[1].equippedIndex,0);
  const addedIndex=save.allies[1].inventory.length-1;
  // The second owner can store again. Its new receipt ID prevents stale clicks.
  await page.locator('[data-entry-key="bag-'+addedIndex+'"] button[data-action="deposit"]').click();
  save=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const nextId=save.warehouse[0].entryId;
  assert.ok(nextId>firstId);
  assert.equal(save.warehouse[0].instance.durability,9);
  const sale=page.locator('[data-entry-key="'+nextId+'"] button[data-action="sell-warehouse"]');
  assert.match(await sale.innerText(),/41 金币/);
  await sale.click();
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"141");
  assert.equal(await page.locator("#campaign-warehouse-count").innerText(),"0/40");
  save=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(save.funds.gold,141);
  assert.equal(save.warehouse.length,0);
  assert.equal(save.allies[1].inventory.length,3);
  assert.equal(save.warehouseSerial,nextId);
  await page.reload({waitUntil:"networkidle"});
  const reloaded=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(reloaded.funds.gold,141);
  assert.equal(reloaded.warehouse.length,0);
  assert.equal(reloaded.allies[0].inventory.length,2);
  assert.equal(reloaded.allies[1].inventory.length,3);
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"141");
  await page.locator("#campaign-start-sortie").click();
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),false);
  assert.equal(await page.locator(".battle-cell").count(),80);
  assert.deepEqual(errors,[],test.name+" page errors");
  await page.close();
 }
}finally{await browser.close();}
