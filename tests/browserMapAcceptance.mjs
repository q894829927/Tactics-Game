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
    // On touch screens red is the union over legal destinations, without hover.
    // On desktop red appears only when a legal destination is hovered.
    const attackSelector=".tactical-highlight-attack .route-attack";
    const initialAttackCount=await page.locator(attackSelector).count();
    if(isMobile) {
      assert.equal(await page.evaluate(() =>
        matchMedia("(hover: none) and (pointer: coarse)").matches),true,
        "mobile context should use touch-first range preview");
      assert.ok(initialAttackCount>0,"mobile selection must show projected attack cells");
      assert.ok(await page.locator(".tactical-highlight-move .route-move-ally").count()>0,
        "mobile selection must retain movement cells");
      // Each color is painted in a separate layer; merely checking that both
      // classes exist would miss a full-screen red overlap regression.
      const colorState=await page.evaluate(() => {
        const blues=[...document.querySelectorAll(".tactical-highlight-move .range-cell")];
        const reds=[...document.querySelectorAll(".tactical-highlight-attack .range-cell")];
        const blue=blues.find(cell=>cell.classList.contains("route-move-ally"));
        const red=reds.find(cell=>cell.classList.contains("route-attack"));
        return {
          overlap:blues.filter((cell,index)=>cell.classList.contains("route-move-ally") &&
            reds[index]?.classList.contains("route-attack")).length,
          blueColor:blue?getComputedStyle(blue).backgroundColor:null,
          redColor:red?getComputedStyle(red).backgroundColor:null
        };
      });
      assert.equal(colorState.overlap,0,"red union must not cover mobile blue movement");
      const rgb=value=>value?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)?.slice(1,4).map(Number);
      const blueRgb=rgb(colorState.blueColor),redRgb=rgb(colorState.redColor);
      assert.ok(blueRgb && blueRgb[2]>blueRgb[0],
        "mobile movement needs a visible blue background");
      assert.ok(redRgb && redRgb[0]>redRgb[2],
        "mobile attack-only cells need a visible red background");
    } else {
      assert.equal(initialAttackCount,0,"desktop selection must not show attack union");
    }
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
        const movedAttacks=await page.locator(attackSelector).count();
        assert.ok(movedAttacks>0 && movedAttacks<initialAttackCount,
          "after movement red must cover only attacks from the new cell");
        const overlapsAfterMove=await page.evaluate(() => {
          const blues=[...document.querySelectorAll(".tactical-highlight-move .range-cell")];
          const reds=[...document.querySelectorAll(".tactical-highlight-attack .range-cell")];
          return blues.filter((cell,index)=>cell.classList.contains("route-move-ally") &&
            reds[index]?.classList.contains("route-attack")).length;
        });
        assert.equal(overlapsAfterMove,0,"movement cell remains blue after moving");
      }
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
      if(isMobile) {
        assert.equal(await page.locator(attackSelector).count(),initialAttackCount,
          "undo should restore mobile projected attack cells");
      }
      await page.locator('.battle-cell[data-x="1"][data-y="5"]').evaluate(el => el.click());
      await page.locator(".unit-command-menu").waitFor({state:"visible",timeout:3000});
      assert.equal(await page.locator(".unit-command-menu").getByText("取消移动",{exact:false}).count(),0,
        "confirming stay must not offer movement rollback");
      if(isMobile) {
        assert.equal(await page.locator(attackSelector).count(),initialAttackCount,
          "confirming stay must keep mobile projected attack cells");
      }
    }
    // Enemy hover and click share the blue movement / red attack legend.
    const enemyCell='.battle-cell[data-x="7"][data-y="1"]';
    if(!isMobile) {
      await page.locator(enemyCell).evaluate(el => {
        const bounds=el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent("pointermove", {
          bubbles:true,pointerType:"mouse",
          clientX:(bounds.left+bounds.right)/2,
          clientY:(bounds.top+bounds.bottom)/2
        }));
      });
      assert.ok(await page.locator(".tactical-highlight-move .route-move-enemy").count()>0,
        "desktop enemy hover should show blue movement");
      assert.ok(await page.locator(attackSelector).count()>0,
        "desktop enemy hover should show red attack coverage");
    }
    // Clear stale hover to ensure clicked enemy inspection gets the focus.
    await page.locator("#game").evaluate(el =>
      el.dispatchEvent(new PointerEvent("pointerleave",{pointerType:"mouse"})));
    await page.locator(enemyCell).evaluate(el=>el.click());
    await page.waitForFunction(() => document.querySelector("#selection-name")?.textContent==="掠夺者 A");
    const enemyState=await page.evaluate(() => {
      const blue=[...document.querySelectorAll(".tactical-highlight-move .range-cell")];
      const red=[...document.querySelectorAll(".tactical-highlight-attack .range-cell")];
      const movement=blue.filter(el=>el.classList.contains("route-move-enemy"));
      const attacks=red.filter(el=>el.classList.contains("route-attack"));
      return {
        moveCount:movement.length,attackCount:attacks.length,
        overlap:blue.filter((el,index)=>el.classList.contains("route-move-enemy") &&
          red[index]?.classList.contains("route-attack")).length,
        moveColor:movement[0]?getComputedStyle(movement[0]).backgroundColor:null,
        attackColor:attacks[0]?getComputedStyle(attacks[0]).backgroundColor:null
      };
    });
    assert.ok(enemyState.moveCount>1,name+" enemy has blue movement tiles");
    assert.ok(enemyState.attackCount>0,name+" enemy has red attack-only tiles");
    assert.equal(enemyState.overlap,0,name+" enemy attack union does not cover blue");
    const channels=s=>s?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)?.slice(1,4).map(Number);
    const enemyBlue=channels(enemyState.moveColor);
    const enemyRed=channels(enemyState.attackColor);
    assert.ok(enemyBlue && enemyBlue[2]>enemyBlue[0],name+" enemy movement is blue");
    assert.ok(enemyRed && enemyRed[0]>enemyRed[2],name+" enemy attack is red");
    await page.screenshot({path:out+"/"+name+"-enemy-range.png",animations:"disabled"});
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
