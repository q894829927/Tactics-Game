import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base=process.env.MAP_ACCEPTANCE_URL || "http://127.0.0.1:4173/games/tactics/";
const out=process.env.MAP_ACCEPTANCE_OUT || "browser-artifacts";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true, args:["--no-sandbox"]});
const cases=[
  {name:"desktop-1920x1080",viewport:{width:1920,height:1080},isMobile:false},
  {name:"desktop-1366x768",viewport:{width:1366,height:768},isMobile:false},
  {name:"mobile-390x844",viewport:{width:390,height:844},isMobile:true},
];
try {
  for(const {name,viewport,isMobile} of cases) {
    const context=await browser.newContext({viewport,isMobile,hasTouch:isMobile,deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    const response=await page.goto(base,{waitUntil:"networkidle",timeout:60000});
    assert.equal(response?.status(),200,`${name} failed to open build`);
    await page.waitForFunction(() => {
      const ground=document.querySelector(".map-ground-canvas");
      return ground?.dataset.material==="loaded" && ground?.dataset.waterMaterial==="loaded";
    },null,{timeout:60000});
    assert.equal(await page.locator(".tactical-hit-grid .battle-cell").count(),80,name);
    assert.equal(await page.locator(".map-ground-canvas").count(),1,name);
    assert.ok((await page.locator(".world-environment .scene-art-sprite").count())>10,name);
    const layers=await page.evaluate(() => {
      const sel=(s)=>getComputedStyle(document.querySelector(s)).pointerEvents;
      return [sel(".world-environment"),sel(".world-ground"),sel(".world-foreground"),
        sel(".tactical-hit-grid")];
    });
    assert.deepEqual(layers,["none","none","none","auto"],name+" layered hit testing");
    const checked=await page.evaluate(() => {
      const el=document.querySelector('.battle-cell[data-x="1"][data-y="5"]');
      if(!(el instanceof HTMLButtonElement))return false;
      el.click();
      return el.classList.contains("is-selected");
    });
    assert.ok(checked,name+" playable ally selection");
    await page.waitForFunction(() => document.querySelector("#selection-name")?.textContent==="岚锋");
    const cameraBefore=await page.locator(".map-world").getAttribute("style");
    const rect=await page.locator("#game").boundingBox();
    assert.ok(rect);
    if(!isMobile) {
      await page.mouse.move(rect.x+rect.width*.42,rect.y+rect.height*.42);
      await page.mouse.wheel(0,-250);
      await page.waitForTimeout(180);
      assert.notEqual(await page.locator(".map-world").getAttribute("style"),cameraBefore,name+" zoom");
    } else {
      assert.equal(await page.locator(".mobile-dock").isVisible(),true,"mobile dock");
      assert.ok((await page.locator("#game").boundingBox()).width>260);
    }
    await page.screenshot({path:`${out}/${name}.png`,animations:"disabled"});
    if(name==="desktop-1920x1080") {
      // Capture the M1 6x5 world-grid slice including independent transparent
      // scenery, never crop and reuse a flattened AI background.
      const base64=await page.evaluate(async () => {
        const source=document.querySelector(".map-ground-canvas");
        const x=10*92,y=4*92,width=6*92,height=5*92,scale=2;
        const canvas=document.createElement("canvas");
        canvas.width=width*scale;canvas.height=height*scale;
        const ctx=canvas.getContext("2d");
        ctx.drawImage(source,x*scale,y*scale,width*scale,height*scale,
          0,0,width*scale,height*scale);
        for(const img of document.querySelectorAll(".world-environment .scene-art-sprite")) {
          try {await img.decode();}catch{continue;}
          const ix=parseFloat(img.style.left),iy=parseFloat(img.style.top);
          const iw=parseFloat(img.style.width),ih=parseFloat(img.style.height);
          if(ix+iw<x||iy+ih<y||ix>x+width||iy>y+height)continue;
          ctx.drawImage(img,(ix-x)*scale,(iy-y)*scale,iw*scale,ih*scale);
        }
        // Simple non-empty color variance gate, not a subjective art-quality score.
        const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
        const sample=[];
        for(let iy=30;iy<canvas.height;iy+=100)
          for(let ix=30;ix<canvas.width;ix+=100) {
            const i=(iy*canvas.width+ix)*4;
            sample.push(data[i]+data[i+1]+data[i+2]);
          }
        if(new Set(sample).size<5)throw Error("M1 slice has no meaningful visual detail");
        return canvas.toDataURL("image/png").split(",")[1];
      });
      writeFileSync(`${out}/M1-6x5-riverbank.png`,Buffer.from(base64,"base64"));
    }
    assert.deepEqual(errors,[],name+" uncaught browser errors");
    console.log(`PASS ${name}: map assets, 80 cells, interactive selection, screenshots`);
    await context.close();
  }
} finally {
  await browser.close();
}
