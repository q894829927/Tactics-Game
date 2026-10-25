/** Spot-check the live browser's per-strike HUD geometry and compact support. */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
const base=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
mkdirSync("browser-artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
  const page=await browser.newPage({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500});
  const errs=[];page.on("pageerror",e=>errs.push(e.message));
  assert.equal((await page.goto(base,{waitUntil:"networkidle",timeout:60000}))?.status(),200);
  await page.evaluate(()=>{
   document.getElementById("attack-forecast").hidden=false;
   const s=(id,t)=>document.getElementById(id).textContent=t;
   s("forecast-ally-hp-current","24");s("forecast-enemy-hp-current","21");
   s("forecast-ally-hp","24");s("forecast-enemy-hp","15");
   const list=document.getElementById("forecast-strike-list");
   list.replaceChildren();
   const row=document.createElement("div");
   row.className="forecast-strike-entry forecast-strike-entry-attack";
   row.innerHTML='<div class="forecast-strike-side forecast-strike-left"><span class="forecast-strike-chances"><span class="forecast-strike-crit">必杀 4%</span><span class="forecast-strike-hit">命中 100%</span></span></div><span class="forecast-strike-kind"></span><div class="forecast-strike-side forecast-strike-right"><strong class="forecast-strike-damage forecast-strike-damage-enemy">−6</strong></div>';
   list.append(row);
  });
  const initial=await page.evaluate(()=>{
   const pos=id=>document.getElementById(id).getBoundingClientRect();
   const r=document.querySelector(".forecast-strike-entry").getBoundingClientRect();
   const hp=pos("forecast-ally-hp");
   return {top:r.top,bottom:r.bottom,above:pos("forecast-ally-hp-current").top,below:hp.top};
  });
  const label=viewport.width+"x"+viewport.height;
  assert.ok(initial.above<initial.top,label+" original HP first");
  assert.ok(initial.bottom<initial.below,label+" remaining HP last");
  await page.evaluate(()=>{
   const list=document.getElementById("forecast-strike-list");
   const old=list.firstElementChild;
   const second=old.cloneNode(true);second.dataset.kind="follow-up";
   second.querySelector(".forecast-strike-kind").textContent="追击";
   second.querySelector(".forecast-strike-hit").textContent="命中 63%";
   second.querySelector(".forecast-strike-damage").textContent="−9";
   list.append(second);
  });
  const added=await page.evaluate(()=>{
   const list=document.getElementById("forecast-strike-list"),r=list.lastElementChild;
   return {n:list.children.length,bottom:r.getBoundingClientRect().bottom,
     hpTop:document.getElementById("forecast-ally-hp").getBoundingClientRect().top};
  });
  assert.equal(added.n,2,label+" follow-up adds separate row");
  assert.ok(added.bottom<added.hpTop,label+" no overlap after expansion");
  await page.screenshot({path:"browser-artifacts/forecast-strikes-layout-"+label+".png"});
  assert.deepEqual(errs,[],label+" page errors");
  await page.close();
 }
}finally{await browser.close();}
