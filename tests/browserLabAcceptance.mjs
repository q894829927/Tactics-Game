/** Playwright smoke test for the lab, runs against a built preview server. */
import assert from "node:assert/strict";
import {chromium} from "playwright";

const base=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const storage="wildfield-tactics.campaign.v1";
try{
 for(const spec of [
   {name:"desktop",viewport:{width:1366,height:768},isMobile:false},
   {name:"mobile",viewport:{width:390,height:844},isMobile:true},
 ]){
  const context=await browser.newContext({viewport:spec.viewport,
    isMobile:spec.isMobile,hasTouch:spec.isMobile,deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const initial=await page.goto(base,{waitUntil:"networkidle",timeout:60000});
  assert.equal(initial?.status(),200);
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),true);
  const baseline=JSON.stringify({save:"keep-existing-campaign",device:spec.name});
  await page.evaluate(([key,value])=>localStorage.setItem(key,value),[storage,baseline]);
  await page.locator("#campaign-lab-entry").click();
  await page.waitForURL(url=>url.searchParams.get("lab")==="1");
  await page.waitForFunction(()=>
    document.querySelectorAll(".world-unit.has-ally").length===4&&
    document.querySelectorAll(".world-unit.has-enemy").length===6);
  assert.equal(await page.locator("#lab-toolbar").isVisible(),true);
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),false);
  assert.match(await page.locator("#lab-status").innerText(),/不保存战役数据/);
  const preset=page.locator("#lab-preset");
  assert.equal(await preset.locator("option").count(),4);
  for(const id of ["melee","support","movement","mixed"]){
    await preset.selectOption(id);
    assert.equal(await preset.inputValue(),id);
    await page.waitForFunction(()=>document.querySelectorAll(".world-unit").length===10);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),storage),baseline);
  }
  // Confirm in-place command menu: single layer, no extra weapon/category picker.
  await preset.selectOption("support");
  const caster=page.locator('.battle-cell[data-x="1"][data-y="5"]');
  await caster.click();await caster.click();
  await page.locator(".unit-command-menu .command-item").first().waitFor();
  const labels=await page.locator(".unit-command-menu .command-item").allTextContents();
  assert.ok(labels.some(s=>s.includes("攻击")));
  assert.ok(labels.some(s=>s.includes("法术 · 灼烧")));
  assert.ok(labels.some(s=>s.includes("背包")));
  assert.ok(labels.some(s=>s.includes("待机")));
  assert.ok(labels.every(s=>!/战技·试验|护盾·试验|异常·试验|职业技|术法|交换/.test(s)));
  assert.equal(await page.locator(".weapon-picker").isVisible(),false);
  await page.locator('.unit-command-menu .command-item[data-action="inventory"]').click();
  assert.equal(await page.locator(".weapon-picker").isVisible(),false);
  if(spec.isMobile)assert.equal(await page.locator("#unit-sidebar").isVisible(),true);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),storage),baseline);
  await page.locator("#mobile-sidebar-close").click({force:true}).catch(()=>{});
  await page.locator("#lab-reset").click();
  assert.equal(await page.locator("#result-banner").isVisible(),false);
  assert.match(await page.locator("#lab-status").innerText(),/第 1 回合/);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),storage),baseline);
  await page.locator("#lab-exit").click();
  await page.waitForURL(url=>url.searchParams.get("lab")!=="1");
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),true);
  assert.deepEqual(errors,[],spec.name+" console errors");
  await context.close();
 }
}finally{await browser.close();}
