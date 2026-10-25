/** v0.1.44.0 real browsers inspect cinematic forecast + desktop/mobile geometry. */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
const base=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
mkdirSync("browser-artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const viewport of [
  {width:1896,height:660,isMobile:false}, // screenshot-sized enemy-first forecast
  {width:1366,height:768,isMobile:false},
  {width:390,height:844,isMobile:true},
  {width:320,height:568,isMobile:true},
 ]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,
    isMobile:viewport.isMobile,hasTouch:viewport.isMobile});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  assert.equal((await page.goto(base,{waitUntil:"networkidle",timeout:60000}))?.status(),200);
  const images=await page.evaluate(async()=>{
   const hide=document.getElementById("campaign-preparation-overlay");
   if(hide)hide.hidden=true;
   const pane=document.getElementById("attack-forecast");
   pane.hidden=false;
   const set=(id,v)=>document.getElementById(id).textContent=v;
   set("forecast-attacker","霜羽");set("forecast-defender","掠夺者 C");
   set("forecast-ally-role","弓手");set("forecast-enemy-role","步兵");
   set("forecast-ally-weapon","长弓");set("forecast-enemy-weapon","短斧");
   set("forecast-ally-hp-current","24");set("forecast-enemy-hp-current","21");
   set("forecast-ally-odds","命中 93% · 必杀 0%");
   set("forecast-enemy-odds","");
   set("forecast-enemy-initiative","");
   set("forecast-action-cost","");
   document.getElementById("forecast-action-cost").hidden=true;
   set("forecast-damage","−6");set("forecast-counter","");
   document.getElementById("forecast-counter").hidden=true;
   set("forecast-ally-hp","24");set("forecast-enemy-hp","15");
   for(const [id,width] of [["forecast-ally-bar","100%"],["forecast-ally-after","100%"],
    ["forecast-enemy-bar","100%"],["forecast-enemy-after","71.43%"]]){
      document.getElementById(id).style.width=width;
   }
   const srcs=["archer.svg","raider.svg"];
   const result=[];
   for(const [i,side] of ["ally","enemy"].entries()){
     const image=document.getElementById("forecast-"+side+"-art");
     image.src=new URL("assets/ui/portraits/"+srcs[i],location.href).href;
     await image.decode();
     result.push({side,width:image.naturalWidth,height:image.naturalHeight});
   }
   return result;
  });
  assert.ok(images.every(i=>i.width>200&&i.height>300));
  const measurement=await page.evaluate(()=>{
   const rect=id=>{
    const b=document.getElementById(id).getBoundingClientRect();
    return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};
   };
   return {
    root:rect("attack-forecast"),allyArt:rect("forecast-ally-art"),
    enemyArt:rect("forecast-enemy-art"),allyName:rect("forecast-attacker"),
    duel:rect("forecast-ally-initiative"),
    button:rect("forecast-confirm"),odds:rect("forecast-ally-odds"),
    originalHp:rect("forecast-ally-hp-current"),
    enemyHp:rect("forecast-enemy-hp-current"),
    damage:rect("forecast-damage"),
    counter:rect("forecast-counter"),
    strike:rect("forecast-first-strike-row"),
    costDisplay:getComputedStyle(document.getElementById("forecast-action-cost")).display,
    enemyInitiativeDisplay:getComputedStyle(document.getElementById("forecast-enemy-initiative")).display,
    enemyOddsDisplay:getComputedStyle(document.getElementById("forecast-enemy-odds")).display,
    hpTrack:rect("forecast-ally-bar"),hpValue:rect("forecast-ally-hp"),
    returnButton:rect("forecast-cancel"),
    allyTrack:rect("forecast-ally-bar"),
    color:getComputedStyle(document.getElementById("forecast-ally-after")).backgroundImage,
    portraitMode:getComputedStyle(document.getElementById("forecast-ally-art")).objectFit,
  };
  });
  const id=viewport.width+"x"+viewport.height;
  assert.ok(measurement.allyArt.height>measurement.allyName.height*2,id+" portraits large");
  assert.ok(measurement.allyArt.x<measurement.enemyArt.x,id+" portrait sides");
  assert.ok(measurement.originalHp.y<measurement.odds.y,id+" original HP first");
  assert.ok(measurement.odds.y<measurement.strike.y,id+" odds before strikes");
  const middle=r=>r.x+r.width/2;
  assert.ok(Math.abs(middle(measurement.damage)-middle(measurement.enemyHp))<=4,
    id+" damage must align with receiving enemy's original HP");
  assert.equal(measurement.costDisplay,"none",id+" no cost tutorial prose");
  assert.equal(measurement.enemyInitiativeDisplay,"none",id+" no counter text");
  assert.equal(measurement.enemyOddsDisplay,"none",id+" no counter odds");
  assert.ok(measurement.strike.bottom<measurement.hpValue.y,id+" projected HP at bottom");
  assert.ok(measurement.hpTrack.x<measurement.hpValue.x,id+" left HP number near center");
  assert.ok(measurement.root.y>viewport.height*.25,id+" map still visible above forecast");
  assert.ok(measurement.root.right<=viewport.width+2,id+" no horizontal overflow");
  assert.ok(measurement.button.height>= (viewport.width<=900?40:30),id+" actionable button");
  assert.equal(measurement.portraitMode,"contain");
  // Verify defender's retaliation goes below OUR original HP rather than
  // being centered in the full-width strike bar.
  await page.evaluate(()=>{
    const counter=document.getElementById("forecast-counter");
    counter.hidden=false;counter.textContent="−4";
  });
  const counterCenter=await page.evaluate(()=>{
    const r=document.getElementById("forecast-counter").getBoundingClientRect();
    return r.x+r.width/2;
  });
  assert.ok(Math.abs(counterCenter-middle(measurement.originalHp))<=4,
    id+" counter damage must align with receiving ally's original HP");
  await page.evaluate(()=>{document.getElementById("forecast-counter").hidden=true;});
  await page.screenshot({path:"browser-artifacts/cinematic-forecast-"+id+".png"});

  // Regression for enemy-first, no-counter combat: old :empty{display:none}
  // made CSS Grid auto-flow the enemy odds into the *separator's* 6%-width
  // column, rendering "命中 1…" instead of the full text.
  const enemyOdds="命中 100% · 必杀 5%";
  await page.evaluate(odds=>{
    const set=(id,v)=>document.getElementById(id).textContent=v;
    set("forecast-ally-odds","");
    set("forecast-enemy-odds",odds);
    set("forecast-ally-initiative","");
    set("forecast-enemy-initiative","先攻");
    set("forecast-ally-hp-current","18");
    set("forecast-enemy-hp-current","21");
    set("forecast-ally-hp","12");
    set("forecast-enemy-hp","21");
    set("forecast-counter","−6");
    document.getElementById("forecast-counter").hidden=false;
    document.getElementById("forecast-damage").hidden=true;
  },enemyOdds);
  const enemyFirst=await page.evaluate(()=>{
    const row=document.querySelector(".forecast-odds-row").getBoundingClientRect();
    const enemy=document.getElementById("forecast-enemy-odds");
    const ally=document.getElementById("forecast-ally-odds");
    const rect=enemy.getBoundingClientRect();
    return {
      rowCenter:row.x+row.width/2,
      enemyStart:rect.x,
      enemyWidth:rect.width,
      visible:getComputedStyle(enemy).display!=="none",
      fullWidth:enemy.scrollWidth,
      clientWidth:enemy.clientWidth,
      leftHidden:getComputedStyle(ally).display==="none",
      value:enemy.textContent
    };
  });
  assert.equal(enemyFirst.value,enemyOdds,id+" enemy-first odds preserved");
  assert.equal(enemyFirst.leftHidden,true,id+" no-counter odds hidden");
  assert.equal(enemyFirst.visible,true,id+" enemy odds shown");
  assert.ok(enemyFirst.enemyStart>enemyFirst.rowCenter,
    id+" enemy odds must occupy right half, not separator column");
  assert.ok(enemyFirst.clientWidth>=enemyFirst.fullWidth,
    id+" enemy hit/crit must not be truncated");
  await page.screenshot({path:"browser-artifacts/enemy-first-odds-"+id+".png"});
  assert.deepEqual(errors,[],id+" page errors");
  await page.close();
 }
}finally{await browser.close();}
