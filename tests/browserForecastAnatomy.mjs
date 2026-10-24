/**
 * Visual geometry smoke at the game's real production viewport.
 * Uses fixture text to isolate CSS geometry; numerical calculations are checked
 * independently by the forecast anatomy and engine tests.
 */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
const base=process.env.MAP_ACCEPTANCE_URL||
  "http://127.0.0.1:4173/games/tactics/";
mkdirSync("browser-artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
  const page=await browser.newPage({viewport,isMobile:viewport.width<500,
    hasTouch:viewport.width<500});
  const errs=[];page.on("pageerror",e=>errs.push(e.message));
  const response=await page.goto(base,{waitUntil:"networkidle",timeout:60000});
  assert.equal(response?.status(),200);
  await page.evaluate(()=>{
    const root=document.getElementById("attack-forecast");
    root.hidden=false;
    const set=(id,text)=>{
      const e=document.getElementById(id);e.textContent=text;
    };
    set("forecast-ally-hp-current","24");
    set("forecast-enemy-hp-current","21");
    set("forecast-ally-odds","命中 93% · 必杀 0%");
    set("forecast-enemy-odds","无法反击");
    set("forecast-damage","−6");
    set("forecast-counter","");
    document.getElementById("forecast-counter").hidden=true;
    document.getElementById("forecast-followup-row").hidden=true;
    set("forecast-ally-hp","24");set("forecast-enemy-hp","15");
  });
  const metrics=await page.evaluate(()=>{
    const box=id=>{
      const r=document.getElementById(id).getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,
        width:r.width,height:r.height};
    };
    return {current:box("forecast-ally-hp-current"),
      odds:box("forecast-ally-odds"),damage:box("forecast-damage"),
      projected:box("forecast-ally-hp"),
      root:box("attack-forecast"),
      followHidden:getComputedStyle(document.getElementById("forecast-followup-row")).display==="none",
      counterHidden:getComputedStyle(document.getElementById("forecast-counter")).display==="none"};
  });
  const name=viewport.width+"x"+viewport.height;
  assert.ok(metrics.current.top<metrics.odds.top,name+" original HP must be above odds");
  assert.ok(metrics.odds.top<metrics.damage.top,name+" odds must be above damage");
  assert.ok(metrics.damage.top<metrics.projected.top,name+" damage before projected HP");
  assert.equal(metrics.followHidden,true,name+" unused follow-up hidden");
  assert.equal(metrics.counterHidden,true,name+" no counter damage hidden");
  assert.ok(metrics.root.width<=viewport.width+3,name+" overlay fits viewport");
  await page.evaluate(()=>{
    document.getElementById("forecast-followup-row").hidden=false;
    document.getElementById("forecast-ally-followup").textContent="−3";
    document.getElementById("forecast-ally-followup").hidden=false;
    document.getElementById("forecast-enemy-followup").hidden=true;
  });
  const more=await page.evaluate(()=>{
    const f=document.getElementById("forecast-followup-row").getBoundingClientRect();
    const hp=document.getElementById("forecast-ally-hp").getBoundingClientRect();
    return {visible:getComputedStyle(document.getElementById("forecast-followup-row")).display!=="none",
      top:f.top,bottom:f.bottom,hpTop:hp.top};
  });
  assert.equal(more.visible,true,name+" extra follow-up row visible");
  assert.ok(more.bottom<more.hpTop,name+" follow-up remains before projected HP");
  await page.screenshot({path:"browser-artifacts/forecast-layers-"+name+".png"});
  assert.deepEqual(errs,[],name+" runtime errors");
  await page.close();
 }
}finally{await browser.close();}
