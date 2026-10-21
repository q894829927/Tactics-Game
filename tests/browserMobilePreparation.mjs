/**
 * Mobile campaign-preparation regression:
 * real small-phone viewport, touch scroll, always-accessible sortie CTA.
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";

const base=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const phones=[
  {width:320,height:568},
  {width:375,height:667},
  {width:390,height:844},
  {width:430,height:932},
];
try{
  for(const viewport of phones){
    const label=viewport.width+"x"+viewport.height;
    const context=await browser.newContext({
      viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2,
    });
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const response=await page.goto(base,{waitUntil:"networkidle",timeout:60000});
    assert.equal(response?.status(),200,label+" page load");
    const overlay=page.locator("#campaign-preparation-overlay");
    const scroll=page.locator("#campaign-preparation-scroll");
    const confirm=page.locator("#campaign-start-sortie");
    assert.equal(await overlay.isVisible(),true,label+" preparation opens");
    assert.equal(await confirm.isVisible(),true,label+" sortie accessible");

    const layout=await page.evaluate(()=>{
      const panel=document.querySelector(".campaign-preparation-panel");
      const region=document.querySelector("#campaign-preparation-scroll");
      const footer=document.querySelector(".campaign-preparation-panel .campaign-footer");
      const start=document.querySelector("#campaign-start-sortie");
      const rect=(element)=>element.getBoundingClientRect().toJSON();
      return {panel:rect(panel),region:rect(region),
        footer:rect(footer),start:rect(start),
        scrollHeight:region.scrollHeight,clientHeight:region.clientHeight,
        scrollOverflow:getComputedStyle(region).overflowY,
        touchAction:getComputedStyle(region).touchAction,
        viewportHeight:window.innerHeight,
        horizontalOverflow:panel.scrollWidth-panel.clientWidth};
    });
    assert.ok(layout.horizontalOverflow<=2,label+" no horizontal overflow");
    assert.ok(layout.clientHeight>60,label+" scrollable body has usable height");
    assert.ok(layout.scrollHeight>layout.clientHeight+70,
      label+" content exceeds scroll body so scrolling is necessary");
    assert.equal(layout.scrollOverflow,"auto",label+" vertical overflow enabled");
    assert.match(layout.touchAction,/pan-y/,label+" vertical touch gesture allowed");
    assert.ok(layout.start.top>=layout.panel.top-1 &&
      layout.start.bottom<=layout.panel.bottom+1 &&
      layout.start.bottom<=layout.viewportHeight+1,
      label+" sortie CTA remains in visible viewport");
    assert.ok(layout.footer.top>=layout.region.bottom-2,
      label+" fixed footer not overlapped by scrollable content");
    // Exercise real browser scrolling within the preparation panel.
    const regionBox=await scroll.boundingBox();
    assert.ok(regionBox,label+" scroll region present");
    await page.mouse.move(regionBox.x+regionBox.width*.55,
      regionBox.y+Math.min(regionBox.height*.5,170));
    await page.mouse.wheel(0,540);
    await page.waitForFunction(()=>{
      const el=document.querySelector("#campaign-preparation-scroll");
      return el&&el.scrollTop>30;
    },null,{timeout:7000});
    const afterScroll=await scroll.evaluate(el=>el.scrollTop);
    assert.ok(afterScroll>30,label+" content really scrolls");

    // Both footer actions can be clicked without dragging past long details.
    await page.locator("#campaign-change-class").click({timeout:7000});
    assert.equal(await page.locator("#class-preparation-overlay").isVisible(),
      true,label+" open class preparation");
    await page.locator("#class-preparation-close").click({timeout:7000});
    assert.equal(await overlay.isVisible(),true,label+" back to preparation");
    assert.ok(await scroll.evaluate(el=>el.scrollTop)>20,
      label+" closing class menu preserves scroll position");
    await confirm.click({timeout:7000});
    await page.waitForFunction(()=>
      document.querySelector("#campaign-preparation-overlay")?.hidden===true,
      null,{timeout:7000});
    assert.equal(await overlay.isVisible(),false,label+" sortie launches");
    assert.equal(await page.locator(".battle-cell").count(),80,
      label+" actual battlefield is interactive");
    assert.deepEqual(errors,[],label+" page errors");
    await context.close();
  }
}finally{
  await browser.close();
}
