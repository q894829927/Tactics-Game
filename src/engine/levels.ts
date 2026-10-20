/** C4-1B: declarative four-stage chapter. Original 1-1 remains unchanged. */
import type {CharacterId} from "./characters.ts";
import {CHARACTER_LIBRARY,createCharacter} from "./characters.ts";
import {CLASS_LIBRARY,type ClassId} from "./classes.ts";
import {canWield} from "./weapons.ts";
export const LEVEL_WIDTH=10,LEVEL_HEIGHT=8;
export type Spawn={id:CharacterId;team:"ally"|"enemy";x:number;y:number;
  classId?:ClassId;holdPosition?:boolean};
export type Victory=
  |{kind:"defeat-unit";unitId:CharacterId}
  |{kind:"reach-tile";x:number;y:number;team:"ally"};
type Level={id:string;chapter:string;name:string;description:string;objectiveLabel:string;
 terrain:readonly string[];spawns:readonly Spawn[];victory:Victory;
 prerequisite:string|null;prototype:boolean};
const original:readonly Spawn[]=[
 {id:"a1",team:"ally",x:1,y:5},{id:"a2",team:"ally",x:1,y:6},
 {id:"a3",team:"ally",x:2,y:6},{id:"a4",team:"ally",x:0,y:7},
 {id:"e1",team:"enemy",x:7,y:1},{id:"e2",team:"enemy",x:8,y:2},
 {id:"e3",team:"enemy",x:7,y:3},{id:"e4",team:"enemy",x:8,y:4},
 {id:"e5",team:"enemy",x:9,y:5},{id:"e6",team:"enemy",x:9,y:7},
];
export const LEVELS={
 "chapter-1-1":{id:"chapter-1-1",chapter:"第一章",name:"林缘遭遇",
  description:"教学战：原4v6布局，熟悉地形与反击。原地图和胜利规则不变。",
  objectiveLabel:"击败赤旗统领",
  terrain:["GGG...GGGG",".F..H.GFGG","G..##..GGG","F.....H.GG",
    "GGF.GGG...","G..H.GF...","G....GG...","....GGG..."],
  spawns:original,victory:{kind:"defeat-unit",unitId:"e6"},prerequisite:null,prototype:false},
 "chapter-1-2":{id:"chapter-1-2",chapter:"第一章",name:"森林伏击",
  description:"绕行密林压制伏击射手；森林防御及斥候林荫更有价值，消灭弩手而非统领才能通关。",
  objectiveLabel:"击败驻守东北森林的精锐射手（弩手）",
  terrain:["FFF.GGFFFF","FF..G.FFFF","F..FF..FGF","G..F...F.G",
    "..FF.G..GG",".F....F..G","G..F..G..G","..G..G...."],
  spawns:[
    {id:"a1",team:"ally",x:0,y:5},{id:"a2",team:"ally",x:1,y:6},
    {id:"a3",team:"ally",x:0,y:7},{id:"a4",team:"ally",x:2,y:7},
    {id:"e1",team:"enemy",x:5,y:2},{id:"e2",team:"enemy",x:6,y:4},
    {id:"e3",team:"enemy",x:8,y:1,classId:"eliteMarksman",holdPosition:true},
    {id:"e4",team:"enemy",x:8,y:6},{id:"e5",team:"enemy",x:7,y:5},
    {id:"e6",team:"enemy",x:8,y:7},
  ],victory:{kind:"defeat-unit",unitId:"e3"},prerequisite:"chapter-1-1",prototype:false},
 "chapter-1-3":{id:"chapter-1-3",chapter:"第一章",name:"山口突围",
  description:"崎岖山道限制骑乘机动；任意我方单位到达右侧J4撤离点，确认待机或行动即可通关，无需全灭敌人。",
  objectiveLabel:"存活友军在 J4 撤离点结束一次行动",
  terrain:["GGHH...GGG","G.#H..#GGG","G.#...#..G","G....H...G",
    "G.#HH.#..G","G.#...#GGG","GGG...GGGG","....GG...."],
  spawns:[
    {id:"a1",team:"ally",x:0,y:5},{id:"a2",team:"ally",x:1,y:6},
    {id:"a3",team:"ally",x:0,y:7},{id:"a4",team:"ally",x:2,y:7},
    {id:"e1",team:"enemy",x:5,y:2},
    {id:"e2",team:"enemy",x:7,y:3,classId:"roverCavalry"},
    {id:"e3",team:"enemy",x:8,y:2,classId:"eliteMarksman",holdPosition:true},
    {id:"e4",team:"enemy",x:5,y:4},{id:"e5",team:"enemy",x:8,y:5},
    {id:"e6",team:"enemy",x:9,y:1,holdPosition:true},
  ],victory:{kind:"reach-tile",x:9,y:3,team:"ally"},prerequisite:"chapter-1-2",prototype:false},
 "chapter-1-4":{id:"chapter-1-4",chapter:"第一章",name:"要塞攻坚",
  description:"突破庭院隔墙与守点壁垒，优先处理射手或破阵战士，再击败东北角的统领。",
  objectiveLabel:"击败驻守要塞东北侧的赤旗统领",
  terrain:["GGG...GGGG","G..##..G.G","G..#..#..G","......H...",
    "G.F#...#GG","...#.#...G","G.....G.GG","....GG...."],
  spawns:[
    {id:"a1",team:"ally",x:0,y:5},{id:"a2",team:"ally",x:1,y:6},
    {id:"a3",team:"ally",x:0,y:7},{id:"a4",team:"ally",x:2,y:7},
    {id:"e1",team:"enemy",x:5,y:2,classId:"formationBreaker"},
    {id:"e2",team:"enemy",x:6,y:3,classId:"sentinel",holdPosition:true},
    {id:"e3",team:"enemy",x:7,y:2,classId:"eliteMarksman",holdPosition:true},
    {id:"e4",team:"enemy",x:6,y:5},{id:"e5",team:"enemy",x:8,y:4},
    {id:"e6",team:"enemy",x:8,y:1,holdPosition:true},
  ],victory:{kind:"defeat-unit",unitId:"e6"},prerequisite:"chapter-1-3",prototype:false},
} as const satisfies Record<string,Level>;
export type LevelId=keyof typeof LEVELS;
export const LEVEL_IDS=Object.keys(LEVELS) as LevelId[];
export const DEFAULT_LEVEL_ID:LevelId="chapter-1-1";
export function isLevelId(x:unknown):x is LevelId{
 return typeof x==="string"&&Object.hasOwn(LEVELS,x);
}
export function levelUnlocked(id:LevelId,completed:readonly LevelId[]):boolean{
 const prior=LEVELS[id].prerequisite;
 return prior===null||completed.includes(prior);
}
export function validLevelProgress(selected:unknown,completed:unknown):boolean{
 return isLevelId(selected)&&Array.isArray(completed)&&
   completed.length===new Set(completed).size&&completed.every(isLevelId)&&
   completed.every((id:LevelId)=>levelUnlocked(id,completed))&&levelUnlocked(selected,completed);
}
type ObjectiveUnit={id:string;team:"ally"|"enemy";hp:number;x:number;y:number;spent:boolean};
export function objectiveComplete(goal:Victory,units:readonly ObjectiveUnit[]):boolean{
 if(goal.kind==="defeat-unit")return !units.some(u=>u.id===goal.unitId&&u.hp>0);
 return units.some(u=>u.team===goal.team&&u.hp>0&&u.spent&&u.x===goal.x&&u.y===goal.y);
}
/** Fail fast for invalid terrain, enemy job credentials, and unreachable exits. */
for(const level of Object.values(LEVELS)){
 if(level.terrain.length!==LEVEL_HEIGHT||
    level.terrain.some(row=>row.length!==LEVEL_WIDTH||[...row].some(t=>!".GFH#".includes(t))))
   throw Error("Invalid terrain: "+level.id);
 const units=level.spawns;
 if(new Set(units.map(u=>u.id)).size!==units.length||
    new Set(units.map(u=>u.x+","+u.y)).size!==units.length||
    !["a1","a2","a3","a4"].every(id=>units.some(u=>u.id===id))||
    units.some(u=>u.x<0||u.y<0||u.x>=LEVEL_WIDTH||u.y>=LEVEL_HEIGHT||
      level.terrain[u.y]?.[u.x]==="#"||
      (u.id.startsWith("a")?u.team!=="ally":u.team!=="enemy")||
      ("classId" in u&&u.classId!==undefined&&
        (u.team!=="enemy"||!Object.hasOwn(CLASS_LIBRARY,u.classId)||
         !canWield(u.classId,CHARACTER_LIBRARY[u.id].startingWeapons[0],
           createCharacter(u.id).weaponExp)))||
      ("holdPosition" in u&&u.team!=="enemy")))
   throw Error("Invalid deployment: "+level.id);
 const goal=level.victory;
 if(goal.kind==="defeat-unit"){
   if(!units.some(u=>u.id===goal.unitId&&u.team==="enemy"))
     throw Error("Missing target: "+level.id);
 }else{
   if(goal.x<0||goal.x>=LEVEL_WIDTH||goal.y<0||goal.y>=LEVEL_HEIGHT||
       level.terrain[goal.y]?.[goal.x]==="#"||
       units.some(u=>u.x===goal.x&&u.y===goal.y))
     throw Error("Invalid exit: "+level.id);
   const queue=units.filter(u=>u.team==="ally").map(u=>[u.x,u.y] as const);
   const seen=new Set(queue.map(([x,y])=>x+","+y));
   while(queue.length){
     const [x,y]=queue.shift()!;
     for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
       if(nx<0||nx>=LEVEL_WIDTH||ny<0||ny>=LEVEL_HEIGHT||
          level.terrain[ny]?.[nx]==="#"||seen.has(nx+","+ny))continue;
       seen.add(nx+","+ny);queue.push([nx,ny]);
     }
   }
   if(!seen.has(goal.x+","+goal.y))
      throw Error("Unreachable exit: "+level.id);
 }
}
