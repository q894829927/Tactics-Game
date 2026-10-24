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
  // Check that a sentinel with two compatible lances does not show duplicate
  // career arts or ordinary weapon arts.
  await preset.selectOption("melee");
  const sentinel=page.locator('.battle-cell[data-x="1"][data-y="6"]');
  await sentinel.evaluate(el=>el.click());
  await sentinel.evaluate(el=>el.click());
  await page.locator('.unit-command-menu .command-item[data-key="art"]').evaluate(el=>el.click());
  const arts=await page.locator('.unit-command-menu .command-item[data-group="art"]').allTextContents();
  assert.equal(arts.filter(s=>s.includes("拦截刺")).length,1);
  assert.equal(arts.filter(s=>s.includes("强击")).length,1);
  // All heroes see only five top-level commands (six after a real move).
  await preset.selectOption("support");
  const caster=page.locator('.battle-cell[data-x="1"][data-y="5"]');
  await caster.evaluate(el=>el.click());await caster.evaluate(el=>el.click());
  await page.locator(".unit-command-menu .command-item").first().waitFor();
  let labels=await page.locator(".unit-command-menu .command-item").allTextContents();
  assert.deepEqual(labels.map(s=>s.replace(/[⚔✦✧▣⌛]/gu,"").trim()),
    ["攻击","战技","法术","背包","待机"]);
  assert.equal(await page.locator(".weapon-picker").isVisible(),false);
  // Clicking 法术 reveals owned 火焰术 and 雷电术 plus status actions.
  await page.locator('.unit-command-menu .command-item[data-key="magic"]').evaluate(el=>el.click());
  await page.locator(".command-subtitle").waitFor();
  assert.equal(await page.locator(".command-subtitle").innerText(),"选择法术");
  labels=await page.locator(".unit-command-menu .command-item").allTextContents();
  assert.ok(labels.some(s=>s.includes("火焰术")));
  assert.ok(labels.some(s=>s.includes("雷电术")));
  assert.ok(labels.some(s=>s.includes("灼烧")));
  assert.equal(await page.locator(".weapon-picker").isVisible(),false);
  await page.locator('.command-item[data-action="back"]').evaluate(el=>el.click());
  assert.equal(await page.locator(".command-subtitle").count(),0);
  await page.locator('.command-item[data-key="art"]').evaluate(el=>el.click());
  assert.equal(await page.locator(".command-subtitle").innerText(),"选择战技");
  assert.ok(await page.locator('.command-item[data-action="back"]').count());
  await page.locator('.command-item[data-action="back"]').evaluate(el=>el.click());
  // Bag opens IN PLACE, not an offscreen side panel, on desktop and phone.
  await page.locator('.unit-command-menu .command-item[data-key="inventory"]').evaluate(el=>el.click());
  assert.equal(await page.locator(".command-subtitle").innerText(),"选择装备");
  assert.equal(await page.locator('.unit-command-menu [data-action="equip"]').count(),2);
  assert.ok(await page.locator('.unit-command-menu [data-weapon-index="0"]').getAttribute("aria-pressed")==="true");
  assert.match(await page.locator('.unit-command-menu [data-weapon-index="1"]').innerText(),/雷电术/);
  assert.equal(await page.locator(".weapon-picker").isVisible(),false);
  if(spec.isMobile)
    assert.equal(await page.locator("#unit-sidebar").isVisible(),false,
      "Mobile gear is available without opening the side drawer");
  // Click the non-equipped weapon, retain list, inspect the new equipped mark.
  await page.locator('.unit-command-menu [data-weapon-index="1"]').evaluate(el=>el.click());
  assert.equal(await page.locator(".command-subtitle").innerText(),"选择装备");
  assert.equal(await page.locator('.unit-command-menu [data-weapon-index="1"]').getAttribute("aria-pressed"),"true");
  assert.equal(await page.locator('.unit-command-menu [data-weapon-index="0"]').getAttribute("aria-pressed"),"false");
  assert.match(await page.locator("#weapon-name").innerText(),/雷电术/);
  await page.locator('.unit-command-menu [data-action="back"]').evaluate(el=>el.click());
  assert.equal(await page.locator(".command-subtitle").count(),0);
  assert.equal(await page.locator('.unit-command-menu [data-key="inventory"]').count(),1);
  // Escape/back returns to the main commands without spending a turn.
  await page.locator('.unit-command-menu [data-key="inventory"]').evaluate(el=>el.click());
  if(spec.isMobile){
    await page.locator("#mobile-back").evaluate(el=>el.click());
  }else await page.keyboard.press("Escape");
  assert.equal(await page.locator(".command-subtitle").count(),0);
  assert.equal(await page.locator('.unit-command-menu [data-key="wait"]').count(),1);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),storage),baseline);
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
