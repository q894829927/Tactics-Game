/** Desktop + phone visual acceptance: one row for EACH prospective strike.
 * The app-level strike construction is tested separately in forecastAnatomy.
 */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "playwright";
const base=process.env.MAP_ACCEPTANCE_URL??"http://127.0.0.1:4173/games/tactics/";
mkdirSync("browser-artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
 for(const viewport of [
  {width:1896,height:660,isMobile:false},
  {width:1366,height:768,isMobile:false},
  {width:390,height:844,isMobile:true},
  {width:320,height:568,isMobile:true},
 ]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,
    isMobile:viewport.isMobile,hasTouch:viewport.isMobile});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  assert.equal((await page.goto(base,{waitUntil:"networkidle",timeout:60000}))?.status(),200);
  const images=await page.evaluate(async()=>{
   const prep=document.getElementById("campaign-preparation-overlay");
   if(prep)prep.hidden=true;
   document.getElementById("attack-forecast").hidden=false;
   const set=(id,s)=>document.getElementById(id).textContent=s;
   set("forecast-attacker","霜羽");set("forecast-defender","掠夺者 B");
   set("forecast-ally-role","弓手");set("forecast-enemy-role","步兵");
   set("forecast-ally-weapon","长弓");set("forecast-enemy-weapon","短斧");
   set("forecast-ally-hp-current","24");set("forecast-enemy-hp-current","21");
   set("forecast-ally-hp","19");set("forecast-enemy-hp","7");
   for(const [id,width] of [
    ["forecast-ally-bar","100%"],["forecast-ally-after","79%"],
    ["forecast-enemy-bar","100%"],["forecast-enemy-after","33%"]
   ])document.getElementById(id).style.width=width;
   document.getElementById("forecast-action-cost").hidden=true;
   const img=[];
   for(const [i,side] of ["ally","enemy"].entries()){
    const art=document.getElementById("forecast-"+side+"-art");
    art.src=new URL("assets/ui/portraits/"+["archer.svg","raider.svg"][i],location.href).href;
    await art.decode();
    img.push([art.naturalWidth,art.naturalHeight]);
   }
   return img;
  });
  assert.ok(images.every(([w,h])=>w>200&&h>300));
  const setRows=async values=>page.evaluate(rows=>{
   const list=document.getElementById("forecast-strike-list");
   list.replaceChildren();
   for(const entry of rows){
    const row=document.createElement("div");
    row.className="forecast-strike-entry forecast-strike-entry-"+entry.kind;
    row.dataset.kind=entry.kind;row.dataset.attacker=entry.from;
    const left=document.createElement("div"),right=document.createElement("div");
    left.className="forecast-strike-side forecast-strike-left";
    right.className="forecast-strike-side forecast-strike-right";
    const middle=document.createElement("span");middle.className="forecast-strike-kind";
    middle.textContent=entry.kind==="follow-up"?"追击":"";
    const offence=entry.from==="ally"?left:right;
    const defence=entry.from==="ally"?right:left;
    const odds=document.createElement("span");
    odds.className="forecast-strike-chances";
    for(const [cl,value] of [
      ["forecast-strike-crit","必杀 "+entry.crit+"%"],
      ["forecast-strike-hit","命中 "+entry.hit+"%"]]){
      const elem=document.createElement("span");elem.className=cl;
      elem.textContent=value;odds.append(elem);
    }
    offence.append(odds);
    const damage=document.createElement("strong");
    damage.className="forecast-strike-damage forecast-strike-damage-"+(entry.from==="ally"?"enemy":"ally");
    damage.textContent=entry.damage>0?"−"+entry.damage:"";
    damage.hidden=entry.damage<=0;
    defence.append(damage);
    row.append(left,middle,right);list.append(row);
   }
  },values);
  const id=viewport.width+"x"+viewport.height;
  await setRows([
    {kind:"attack",from:"ally",hit:93,crit:8,damage:6},
    {kind:"counter",from:"enemy",hit:75,crit:3,damage:5},
    {kind:"follow-up",from:"ally",hit:64,crit:8,damage:8}
  ]);
  const metrics=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,
     center:r.x+r.width/2,bottom:r.bottom,width:r.width,height:r.height};};
   const rows=[...document.querySelectorAll("#forecast-strike-list .forecast-strike-entry")];
   return {
    original:rect(document.getElementById("forecast-ally-hp-current")),
    projected:rect(document.getElementById("forecast-ally-hp")),
    hp:rect(document.getElementById("forecast-enemy-hp-current")),
    root:rect(document.getElementById("attack-forecast")),
    portrait:rect(document.getElementById("forecast-ally-art")),
    button:rect(document.getElementById("forecast-confirm")),
    rows:rows.map(row=>({
     kind:row.dataset.kind,from:row.dataset.attacker,
     rect:rect(row),odds:rect(row.querySelector(".forecast-strike-chances")),
     damage:rect(row.querySelector(".forecast-strike-damage")),
     scroll:row.querySelector(".forecast-strike-chances").scrollWidth,
     client:row.querySelector(".forecast-strike-chances").clientWidth,
     oddsText:row.querySelector(".forecast-strike-chances").textContent,
    }))
   };
  });
  assert.equal(metrics.rows.length,3,id+" three distinct attacks");
  assert.deepEqual(metrics.rows.map(r=>r.kind),["attack","counter","follow-up"]);
  assert.ok(metrics.original.y<metrics.rows[0].rect.y,id+" original HP above attacks");
  assert.ok(metrics.rows[2].rect.bottom<metrics.projected.y,id+" remaining HP beneath follow-up");
  assert.ok(metrics.rows[0].odds.center<metrics.rows[0].damage.center,id+" ally first");
  assert.ok(metrics.rows[1].damage.center<metrics.rows[1].odds.center,id+" enemy counter");
  assert.ok(metrics.rows[2].odds.center<metrics.rows[2].damage.center,id+" ally follow-up");
  assert.match(metrics.rows[0].oddsText,/必杀 8%命中 93%/);
  assert.match(metrics.rows[2].oddsText,/必杀 8%命中 64%/);
  assert.ok(metrics.root.y>viewport.height*.15,id+" map still visible");
  assert.ok(metrics.root.width<=viewport.width+3,id+" within viewport");
  assert.ok(metrics.button.height>=(viewport.width<=900?40:30),id+" confirm tappable");
  for(const row of metrics.rows) assert.ok(row.client>=row.scroll,id+" odds not clipped: "+row.kind);
  await page.screenshot({path:"browser-artifacts/forecast-strikes-triple-"+id+".png"});
  await setRows([{kind:"attack",from:"enemy",hit:100,crit:2,damage:6}]);
  const enemyFirst=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll("#forecast-strike-list .forecast-strike-entry")];
    const row=rows[0];
    const odds=row.querySelector(".forecast-strike-chances").getBoundingClientRect();
    const damage=row.querySelector(".forecast-strike-damage").getBoundingClientRect();
    return {count:rows.length,kind:row.dataset.kind,
      enemyOddsRight:odds.x>damage.x,
      contents:row.textContent,visible:row.getBoundingClientRect().height>0};
  });
  assert.equal(enemyFirst.count,1,id+" no-counter only one attack");
  assert.ok(enemyFirst.enemyOddsRight,id+" enemy first odds on right, damage left");
  assert.ok(enemyFirst.visible);
  assert.doesNotMatch(enemyFirst.contents,/无法反击|保底|魔法伤害|耐久不消耗/);
  await page.screenshot({path:"browser-artifacts/forecast-strikes-enemy-"+id+".png"});
  assert.deepEqual(errors,[],id+" runtime errors");
  await page.close();
 }
}finally{await browser.close();}
