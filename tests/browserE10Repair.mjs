/**
 * E1-0 actual preparation / payment / save loop.
 * Exercises desktop + mobile via Chromium; use a validated campaign snapshot
 * as the setup fixture rather than faking payment or business logic in the UI.
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";

const base=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
const key="wildfield-tactics.campaign.v1";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const scenario of [
  {name:"desktop",viewport:{width:1366,height:768},mobile:false},
  {name:"phone",viewport:{width:390,height:844},mobile:true},
 ]){
  const {name,viewport,mobile}=scenario;
  const context=await browser.newContext({
    viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1,
  });
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  assert.equal((await page.goto(base,{waitUntil:"networkidle",timeout:60000}))?.status(),200);
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),true);
  assert.equal(await page.locator("#campaign-repair-panel").count(),1);
  // Triggers the normal preparation-save action once, producing a valid
  // schema=1 snapshot; only the fixture's initial gold/durability is modified.
  await page.locator("#campaign-equipment button").first().click();
  const baseline=await page.evaluate(key=>{
    const v=localStorage.getItem(key);
    if(!v)throw Error("Preparation was not stored");
    return JSON.parse(v);
  },key);
  assert.equal(baseline.schema,1,name+" expected save version");
  assert.equal(baseline.funds.gold,0,name+" initial budget");
  await page.evaluate(({key,save})=>{
    save.funds.gold=120;
    save.allies[0].weaponInstances[0].durability=18;
    save.allies[1].weaponInstances[0].durability=19;
    localStorage.setItem(key,JSON.stringify(save));
  },{key,save:baseline});
  await page.reload({waitUntil:"networkidle"});
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"120");
  const repair=page.locator("#campaign-repair-panel");
  await repair.locator("summary").click();
  const single=page.locator('#campaign-repair-list button[data-repair-index="0"]');
  assert.match(await single.innerText(),/12 金币/);
  assert.equal(await single.isDisabled(),false);
  assert.match(await page.locator("#campaign-repair-all").innerText(),/22 金币/);
  await single.click();
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"108");
  assert.equal(await page.locator('#campaign-repair-list button[data-repair-index="0"]').count(),0);
  assert.match(await page.locator("#campaign-repair-all").innerText(),/10 金币/);
  await page.locator("#campaign-repair-all").click();
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"98");
  assert.equal(await page.locator("#campaign-repair-all").count(),0);
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(after.funds.gold,98,name+" atomic payment stored");
  assert.equal(after.allies[0].weaponInstances[0].durability,24);
  assert.equal(after.allies[1].weaponInstances[0].durability,24);
  assert.equal(after.funds.reputation,baseline.funds.reputation);
  assert.deepEqual(after.funds.vouchers,baseline.funds.vouchers);
  await page.reload({waitUntil:"networkidle"});
  assert.equal((await page.locator("#campaign-gold").innerText()).trim(),"98");
  const repaired=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.equal(repaired.allies[0].weaponInstances[0].durability,24,name+" repaired weapon kept after reload");
  await page.locator("#campaign-start-sortie").click();
  assert.equal(await page.locator("#campaign-preparation-overlay").isVisible(),false,
    name+" repaired party can still start battle");
  assert.equal(await page.locator(".battle-cell").count(),80);
  assert.deepEqual(errors,[],name+" page errors");
  await context.close();
 }
}finally{await browser.close();}
