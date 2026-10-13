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
      const allies=await page.locator(".screen-unit-labels").locator("*").count();
      assert.ok(allies>=4,"mobile ally labels remain present");
      const view=await page.locator("#game").boundingBox();
      const allyPosition=await page.evaluate(() => {
        const el=document.querySelector('.battle-cell[data-x="1"][data-y="5"]');
        const box=el.getBoundingClientRect();
        return {x:(box.left+box.right)/2,y:(box.top+box.bottom)/2};
      });
      assert.ok(allyPosition.x>view.x+45 && allyPosition.x<view.x+view.width-45,
        "mobile camera should frame the initial allied deployment");
    }
    await page.screenshot({path:`${out}/${name}.png`,animations:"disabled"});
    // End-to-end: first click selects, destination click opens commands AFTER
    // animation, right-click/mobile back safely restores the original tile.
    if (name === "desktop-1920x1080" || isMobile) {
      assert.equal(await page.locator(".unit-command-menu").isVisible(),false,
        "initial selection must not open commands");
      await page.locator('.battle-cell[data-x="2"][data-y="5"]').evaluate(el => el.click());
      await page.locator(".unit-command-menu").waitFor({state:"visible",timeout:6500});
      assert.ok(await page.locator(".unit-command-menu").getByText("取消移动",{exact:false}).count());
      if(isMobile) {
        await page.locator("#mobile-back").click();
      } else {
        const target=await page.locator('.battle-cell[data-x="2"][data-y="5"]').boundingBox();
        assert.ok(target);
        await page.mouse.click(target.x+target.width/2,target.y+target.height/2,{button:"right"});
      }
      await page.waitForFunction(() =>
        !!document.querySelector('.battle-cell[data-x="1"][data-y="5"].is-selected'));
      assert.equal(await page.locator(".unit-command-menu").isVisible(),false,
        "undo must close commands and restore the selected original cell");
      await page.locator('.battle-cell[data-x="1"][data-y="5"]').evaluate(el => el.click());
      await page.locator(".unit-command-menu").waitFor({state:"visible",timeout:3000});
      assert.equal(await page.locator(".unit-command-menu").getByText("取消移动",{exact:false}).count(),0,
        "confirming stay must not offer movement rollback");
    }
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
