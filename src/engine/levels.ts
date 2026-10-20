/** C4-1A: stable, declarative 10x8 campaign stages. */
import type {CharacterId} from "./characters.ts";
export const LEVEL_WIDTH=10,LEVEL_HEIGHT=8;
type Spawn={id:CharacterId;team:"ally"|"enemy";x:number;y:number};
type Level={id:string;name:string;chapter:string;description:string;
 terrain:readonly string[];spawns:readonly Spawn[];
 victory:{kind:"defeat-unit";unitId:CharacterId};prerequisite:string|null;prototype:boolean};
const ORIGINAL:readonly Spawn[]=[
 {id:"a1",team:"ally",x:1,y:5},{id:"a2",team:"ally",x:1,y:6},
 {id:"a3",team:"ally",x:2,y:6},{id:"a4",team:"ally",x:0,y:7},
 {id:"e1",team:"enemy",x:7,y:1},{id:"e2",team:"enemy",x:8,y:2},
 {id:"e3",team:"enemy",x:7,y:3},{id:"e4",team:"enemy",x:8,y:4},
 {id:"e5",team:"enemy",x:9,y:5},{id:"e6",team:"enemy",x:9,y:7},
];
export const LEVELS={
 "chapter-1-1":{id:"chapter-1-1",chapter:"第一章",name:"林缘遭遇",
  description:"原4v6首关：击败赤旗统领，保留原有布局与玩法。",
  terrain:["GGG...GGGG",".F..H.GFGG","G..##..GGG","F.....H.GG",
    "GGF.GGG...","G..H.GF...","G....GG...","....GGG..."],
  spawns:ORIGINAL,victory:{kind:"defeat-unit",unitId:"e6"},prerequisite:null,prototype:false},
 "chapter-1-2":{id:"chapter-1-2",chapter:"第一章",name:"林间追击（框架验证）",
  description:"临时测试地图：验证解锁、切关、存档及重玩；C4-1B重新制作正式战术关卡。",
  terrain:["GGG...GGGG","..F.H.GFGG","G...#..GGG",".F....H.GG",
    "G.F.GGG...","G..H.GF...","G.....G...","....GGG..."],
  spawns:[
    {id:"a1",team:"ally",x:0,y:5},{id:"a2",team:"ally",x:1,y:5},
    {id:"a3",team:"ally",x:1,y:6},{id:"a4",team:"ally",x:0,y:7},
    {id:"e1",team:"enemy",x:7,y:1},{id:"e2",team:"enemy",x:8,y:2},
    {id:"e3",team:"enemy",x:6,y:3},{id:"e4",team:"enemy",x:8,y:4},
    {id:"e5",team:"enemy",x:9,y:5},{id:"e6",team:"enemy",x:9,y:7},
  ],victory:{kind:"defeat-unit",unitId:"e6"},prerequisite:"chapter-1-1",prototype:true},
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
  completed.every((id:LevelId)=>levelUnlocked(id,completed))&&
  levelUnlocked(selected,completed);
}
for(const data of Object.values(LEVELS)){
 if(data.terrain.length!==LEVEL_HEIGHT||
    data.terrain.some(row=>row.length!==LEVEL_WIDTH||[...row].some(x=>!".GFH#".includes(x))))
   throw Error("Malformed terrain: "+data.id);
 if(new Set(data.spawns.map(p=>p.id)).size!==data.spawns.length||
    new Set(data.spawns.map(p=>p.x+","+p.y)).size!==data.spawns.length||
    !["a1","a2","a3","a4"].every(id=>data.spawns.some(p=>p.id===id))||
    !data.spawns.some(p=>p.id===data.victory.unitId&&p.team==="enemy")||
    data.spawns.some(p=>p.x<0||p.y<0||p.x>=LEVEL_WIDTH||p.y>=LEVEL_HEIGHT||
      data.terrain[p.y]?.[p.x]==="#"||
      (p.id.startsWith("a")?p.team!=="ally":p.team!=="enemy")))
   throw Error("Malformed deployment: "+data.id);
}
