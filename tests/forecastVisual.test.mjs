import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {forecastPortraitFor} from "../src/scene/forecastPortrait.ts";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html"),css=read("src/style.css"),board=read("src/scene/BoardView.ts");

test("Six original project portraits exist and all mapped classes use known artworks",()=>{
 const classIds=["sword","archer","mage","lancer","raider","commander",
   "duelist","eliteMarksman","healer","sentinel","axeFighter"];
 for(const classId of classIds){
  for(const team of ["ally","enemy"]){
   const asset=forecastPortraitFor(classId,team);
   assert.ok(/^(swordsman|archer|mage|guardian|raider|commander)\.svg$/.test(asset));
   const path="public/assets/ui/portraits/"+asset;
   assert.equal(existsSync(new URL("../"+path,import.meta.url)),true,path);
   const svg=read(path);
   assert.match(svg,/<svg[^>]+viewBox="0 0 360 480"/);
   assert.match(svg,/<path /);
  }
 }
 assert.equal(forecastPortraitFor("archer","ally"),"archer.svg");
 assert.equal(forecastPortraitFor("raider","enemy"),"raider.svg");
 assert.equal(forecastPortraitFor("commander","enemy"),"commander.svg");
});
test("Portraits render as artwork layers, not oversized weapon emoji",()=>{
 assert.match(html,/class="attack-forecast duel-v2 duel-v3"/);
 assert.match(html,/id="forecast-ally-art"/);
 assert.match(html,/id="forecast-enemy-art"/);
 assert.match(html,/class="forecast-portrait-fallback"/);
 assert.match(board,/forecastPortraitFor\(unit\.classId,unit\.team\)/);
 assert.match(board,/assets\/ui\/portraits\//);
 assert.doesNotMatch(board,/getElementById\(prefix\+"portrait"\)!\.textContent=definition\.portrait/);
 assert.match(css,/\.duel-v3 \.forecast-portrait-art\{/);
 assert.match(css,/\.duel-v3 \.forecast-identity\{/);
 assert.match(css,/\.duel-v3 \.forecast-actions button\{/);
});
test("Keep existing forecast layers and real battle logic",()=>{
 const original=html.indexOf('id="forecast-ally-hp-current"');
 const strikes=html.indexOf('id="forecast-strike-list"');
 const remaining=html.indexOf('class="forecast-health"');
 assert.ok(original>0&&original<strikes&&strikes<remaining);
 assert.match(board,/this\.paintStrikeRows\(forecastStrikeRows\(attacker,forecast\)\)/);
 for(const id of ["forecast-attacker","forecast-defender","forecast-confirm","forecast-cancel",
   "forecast-ally-weapon","forecast-enemy-weapon","forecast-ally-bar",
   "forecast-enemy-after","forecast-ally-hp","forecast-enemy-hp"]){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(css,/\.duel-v3 \.forecast-hp-remaining:after\{/);
 assert.match(css,/repeating-linear-gradient\(90deg/);
 assert.match(css,/@media\(max-width:540px\)/);
});
