/** Developer-only tactical lab. One 10x8 map, four resettable fixtures.
 * The lab is never registered in LEVELS or serialized into CampaignSave.
 */
import type {CharacterId} from "./characters.ts";
import type {ClassId} from "./classes.ts";
import type {WeaponId} from "./weapons.ts";
import type {StatusKind} from "./statusEffects.ts";

export const LAB_TERRAIN=[
 "GGF.GH....",
 ".F..##.GG.",
 "GF..#..F..",
 "..H...G...",
 "..F.##..G.",
 ".G.....F..",
 "..G.H.....",
 "....G...G.",
] as const;
export const LAB_LEVEL={
 id:"test-lab",chapter:"测试区域",name:"综合试炼场",
 description:"开发测试专用：不解锁关卡，不发金币、名声或凭证，也不更改战役存档。",
 objectiveLabel:"击败右上角的试炼统领；随时切换预设或重置",
 victory:{kind:"defeat-unit",unitId:"e6"},
 prerequisite:null,prototype:true,
 terrain:LAB_TERRAIN,
} as const;

export type LabSpawn={
 id:CharacterId;x:number;y:number;classId:ClassId;
 weapons:readonly WeaponId[];
 holdPosition?:boolean;wounded?:number;status?:StatusKind;
};
type Fixture={name:string;description:string;coverage:string;
 allies:readonly LabSpawn[];enemies:readonly LabSpawn[]};
export const LAB_PRESETS={
 mixed:{
  name:"综合战斗",description:"剑、枪、弓、治疗对抗重甲、骑兵、射手与统领。",
  coverage:"普攻/反击/追击、武器切换、长短射程、治疗、地形和敌军回合",
  allies:[
   {id:"a1",x:1,y:5,classId:"sword",weapons:["iron-sword","steel-sword","slim-sword"]},
   {id:"a2",x:1,y:6,classId:"lancer",weapons:["iron-lance","javelin","steel-lance"],wounded:7},
   {id:"a3",x:2,y:7,classId:"archer",weapons:["iron-bow","long-bow","steel-bow"]},
   {id:"a4",x:0,y:7,classId:"acolyte",weapons:["healing-prayer","light-bolt"]},
  ],
  enemies:[
   {id:"e1",x:5,y:5,classId:"raider",weapons:["iron-axe","hand-axe"]},
   {id:"e2",x:6,y:3,classId:"sentinel",weapons:["iron-lance"],holdPosition:true},
   {id:"e3",x:8,y:2,classId:"eliteMarksman",weapons:["long-bow","iron-bow"],holdPosition:true},
   {id:"e4",x:7,y:5,classId:"roverCavalry",weapons:["iron-lance","javelin"]},
   {id:"e5",x:8,y:6,classId:"raider",weapons:["hand-axe"]},
   {id:"e6",x:9,y:1,classId:"commander",weapons:["command-sword"],holdPosition:true},
  ],
 },
 melee:{
  name:"近战与克制",description:"职业技、拳套、骑兵克制、重甲抗性和近战反击。",
  coverage:"职业专属技能、七系基础战技、重甲/骑兵克制、命中/闪避、追击",
  allies:[
   {id:"a1",x:1,y:5,classId:"duelist",weapons:["iron-sword","slim-sword","steel-sword"]},
   {id:"a2",x:1,y:6,classId:"sentinel",weapons:["iron-lance","javelin"]},
   {id:"a3",x:2,y:7,classId:"martialArtist",weapons:["training-gauntlet"]},
   {id:"a4",x:0,y:7,classId:"formationBreaker",weapons:["iron-axe","hand-axe","steel-axe"]},
  ],
  enemies:[
   {id:"e1",x:5,y:5,classId:"sentinel",weapons:["iron-lance"]},
   {id:"e2",x:6,y:3,classId:"roverCavalry",weapons:["javelin","iron-lance"]},
   {id:"e3",x:8,y:2,classId:"eliteMarksman",weapons:["iron-bow"],holdPosition:true},
   {id:"e4",x:7,y:5,classId:"raider",weapons:["iron-axe"]},
   {id:"e5",x:8,y:6,classId:"raider",weapons:["hand-axe"]},
   {id:"e6",x:9,y:1,classId:"commander",weapons:["command-sword"],holdPosition:true},
  ],
 },
 support:{
  name:"治疗与异常",description:"有伤员、白法治疗、黑法异常与自带护盾的敌人。",
  coverage:"有效治疗/满血拒绝、法术次数、灼烧/缓足/弱化/标记/护盾和状态到期",
  allies:[
   {id:"a1",x:1,y:5,classId:"arcanist",weapons:["fire-tome","thunder-tome"]},
   {id:"a2",x:1,y:6,classId:"healer",weapons:["healing-prayer","light-bolt"]},
   {id:"a3",x:2,y:7,classId:"scout",weapons:["iron-bow","slim-sword"],wounded:12},
   {id:"a4",x:0,y:7,classId:"mage",weapons:["fire-tome","wind-tome"],wounded:8},
  ],
  enemies:[
   {id:"e1",x:5,y:5,classId:"raider",weapons:["iron-axe"],status:"shield"},
   {id:"e2",x:6,y:3,classId:"sentinel",weapons:["iron-lance"],status:"weakArmor",holdPosition:true},
   {id:"e3",x:8,y:2,classId:"eliteMarksman",weapons:["iron-bow"],holdPosition:true},
   {id:"e4",x:7,y:5,classId:"mage",weapons:["fire-tome"]},
   {id:"e5",x:8,y:6,classId:"raider",weapons:["hand-axe"]},
   {id:"e6",x:9,y:1,classId:"commander",weapons:["command-sword"],holdPosition:true},
  ],
 },
 movement:{
  name:"地形与机动",description:"用骑兵、斥候、远程和拳斗士探索密林、丘陵及峭壁通道。",
  coverage:"地形移动成本、友军穿越、敌军阻挡、路径预览/撤回、远射和骑兵奔袭",
  allies:[
   {id:"a1",x:1,y:5,classId:"roverCavalry",weapons:["iron-lance","javelin","iron-sword"]},
   {id:"a2",x:1,y:6,classId:"scout",weapons:["iron-bow","slim-sword"]},
   {id:"a3",x:2,y:7,classId:"eliteMarksman",weapons:["long-bow","iron-bow"]},
   {id:"a4",x:0,y:7,classId:"brawler",weapons:["training-gauntlet"]},
  ],
  enemies:[
   {id:"e1",x:5,y:5,classId:"sentinel",weapons:["iron-lance"],holdPosition:true},
   {id:"e2",x:6,y:3,classId:"lancer",weapons:["iron-lance"]},
   {id:"e3",x:8,y:2,classId:"eliteMarksman",weapons:["long-bow"],holdPosition:true},
   {id:"e4",x:7,y:5,classId:"raider",weapons:["iron-axe"]},
   {id:"e5",x:8,y:6,classId:"roverCavalry",weapons:["javelin"]},
   {id:"e6",x:9,y:1,classId:"commander",weapons:["command-sword"],holdPosition:true},
  ],
 },
} as const satisfies Record<string,Fixture>;
export type LabPresetId=keyof typeof LAB_PRESETS;
export const LAB_PRESET_IDS=Object.keys(LAB_PRESETS) as LabPresetId[];
export const DEFAULT_LAB_PRESET:LabPresetId="mixed";

// Validate fixtures on import, before they can be exposed to the UI.
for(const preset of Object.values(LAB_PRESETS)){
 const all=[...preset.allies,...preset.enemies];
 if(LAB_TERRAIN.length!==8||LAB_TERRAIN.some(s=>s.length!==10||[...s].some(c=>!".GFH#".includes(c)))||
   all.length!==10||new Set(all.map(s=>s.id)).size!==10||
   new Set(all.map(s=>s.x+","+s.y)).size!==10||
   preset.allies.some(s=>!s.id.startsWith("a"))||
   preset.enemies.some(s=>!s.id.startsWith("e"))||
   all.some(s=>s.x<0||s.x>=10||s.y<0||s.y>=8||
     LAB_TERRAIN[s.y]?.[s.x]==="#"||!s.weapons.length||s.weapons.length>5)){
   throw Error("Invalid tactical lab fixture: "+preset.name);
 }
}
