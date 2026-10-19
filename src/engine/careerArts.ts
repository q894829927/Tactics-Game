/** C4-A: one job-exclusive active action per intermediate class.
 * These are NOT learned seven-family arts and never consume an active art slot.
 * Attack skills share S1-0 cost/forecast/strike pipeline; blessing shares support.
 */
import type {ClassId} from "./classes.ts";
import type {WeaponCategory} from "./equipmentTypes.ts";
export type CareerArt={
  id:string;classId:ClassId;name:string;category:WeaponCategory;
  cost:number;hitBonus:number;damageBonus:number;noFollowUp:boolean;
  description:string;target:"enemy"|"ally";stationary?:boolean;minMoveTiles?:number;
  effect?:"slow"|"weakArmor"|"weakMagic"|"meleeWeaken"|"mark";
  retreatOnKill?:boolean;bonusHeal?:number;
};
export const CAREER_ARTS={
 "swallow-return":{id:"swallow-return",classId:"duelist",name:"燕返",category:"sword",
  cost:3,hitBonus:10,damageBonus:0,noFollowUp:false,target:"enemy",
  retreatOnKill:true,description:"首击命中+10；击败后若身后合法空格存在则自动回退一格"},
 "intercept-lance":{id:"intercept-lance",classId:"sentinel",name:"拦截刺",category:"lance",
  cost:4,hitBonus:0,damageBonus:0,noFollowUp:false,target:"enemy",effect:"slow",
  description:"首击命中后缓足-1一轮"},
 "shieldquake":{id:"shieldquake",classId:"formationBreaker",name:"震盾斩",category:"axe",
  cost:4,hitBonus:0,damageBonus:0,noFollowUp:false,target:"enemy",effect:"weakArmor",
  description:"首击命中降低目标耐物2一轮"},
 "longshot":{id:"longshot",classId:"eliteMarksman",name:"远瞄",category:"bow",
  cost:4,hitBonus:0,damageBonus:2,noFollowUp:true,target:"enemy",stationary:true,
  description:"原地首击伤害+2，双方本次不追击"},
 "short-punch":{id:"short-punch",classId:"martialArtist",name:"寸拳",category:"gauntlet",
  cost:3,hitBonus:0,damageBonus:0,noFollowUp:false,target:"enemy",
  effect:"meleeWeaken",description:"首击命中后令目标下一次近战命中-5"},
 "frailty-sigil":{id:"frailty-sigil",classId:"arcanist",name:"弱化纹",category:"dark",
  cost:2,hitBonus:0,damageBonus:0,noFollowUp:false,target:"enemy",effect:"weakMagic",
  description:"首击命中后耐魔-2一轮，消耗2次黑魔法"},
 "life-gift":{id:"life-gift",classId:"healer",name:"生命赐福",category:"white",
  cost:2,hitBonus:0,damageBonus:0,noFollowUp:false,target:"ally",bonusHeal:4,
  description:"有效治疗基础量+4，消耗2次白魔法"},
 "mounted-thrust":{id:"mounted-thrust",classId:"roverCavalry",name:"枪骑突击",category:"lance",
  cost:4,hitBonus:0,damageBonus:2,noFollowUp:false,target:"enemy",minMoveTiles:3,
  description:"本轮实际移动至少3格后，枪系首击伤害+2"},
 "pathfinder-arrow":{id:"pathfinder-arrow",classId:"scout",name:"探路箭",category:"bow",
  cost:3,hitBonus:0,damageBonus:0,noFollowUp:false,target:"enemy",effect:"mark",
  description:"首击命中后使目标带有标记一轮"},
} as const satisfies Record<string,CareerArt>;
export type CareerArtId=keyof typeof CAREER_ARTS;
export function isCareerArtId(value:unknown):value is CareerArtId{
 return typeof value==="string"&&Object.hasOwn(CAREER_ARTS,value);
}
export function careerArtForClass(id:ClassId):CareerArt|null{
 return (Object.values(CAREER_ARTS) as CareerArt[]).find(a=>a.classId===id)??null;
}
