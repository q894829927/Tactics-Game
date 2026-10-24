/** E1-1 real browser purchase, inventory limit and persistent gold (desktop/mobile). */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const url=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
const key="wildfield-tactics.campaign.v1";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const spec of [
   {name:"desktop",viewport:{width:1366,height:768},isMobile:false},
   {name:"phone",viewport:{width:390,height:844},isMobile:true},
 ]){
  const page=await browser.newPage({viewport:spec.viewport,isMobile:spec.isMobile,
    hasTouch:spec.isMobile,deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const initial=await page.goto(url,{waitUntil:"networkidle",timeout:60000});
  assert.equal(initial?.status(),200,spec.name+" load");
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),true);
  // Ensure the fixture is a valid game save with normal class & equipment data.
  await page.locator("#campaign-equipment button").first().click();
  const valid=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(valid.schema,1);
  valid.funds.gold=400;
  await page.evaluate(([k,s])=>localStorage.setItem(k,JSON.stringify(s)),[key,valid]);
  await page.reload({waitUntil:"networkidle"});
  const panel=page.locator("#campaign-shop-panel");
  await panel.locator("summary").click();
  assert.equal(await page.locator("#campaign-shop-filter").inputValue(),"compatible");
  const purch=page.locator('[data-buy-weapon="iron-sword"]');
  assert.equal(await purch.isDisabled(),false);
  assert.match(await purch.innerText(),/70 金币/);
  await page.locator("#campaign-shop-filter").selectOption("all");
  assert.equal(await page.locator('[data-buy-weapon="iron-lance"]').isDisabled(),true,
    "wrong class item disabled");
  assert.equal(await page.locator('[data-buy-weapon="command-sword"]').count(),0);
  await page.locator("#campaign-shop-filter").selectOption("compatible");
  await purch.click();
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"330");
  assert.equal(await page.locator("#campaign-equipment button").count(),4);
  await page.locator('[data-buy-weapon="slim-sword"]').click();
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"210");
  assert.equal(await page.locator("#campaign-equipment button").count(),5);
  assert.equal(await page.locator('[data-buy-weapon="iron-sword"]').isDisabled(),true,
    "shop closes purchase at MAX_INVENTORY");
  const raw=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(raw.funds.gold,210);
  assert.deepEqual(raw.allies[0].inventory.slice(-2),["iron-sword","slim-sword"]);
  assert.equal(raw.allies[0].weaponInstances[3].durability,24);
  assert.equal(raw.allies[0].weaponInstances[4].durability,24);
  assert.equal(raw.allies[0].equippedIndex,0);
  assert.equal(raw.allies[1].inventory.length,3);
  assert.deepEqual(raw.funds.vouchers,valid.funds.vouchers);
  await page.reload({waitUntil:"networkidle"});
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"210");
  assert.equal(await page.locator("#campaign-equipment button").count(),5);
  await page.locator("#campaign-equipment button").nth(3).click();
  const reequipped=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  assert.equal(reequipped.allies[0].equippedIndex,3);
  await page.locator("#campaign-start-sortie").click();
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),false);
  assert.equal(await page.locator(".battle-cell").count(),80);
  assert.deepEqual(errors,[],spec.name+" page errors");
  await page.close();
 }
}finally{await browser.close();}
