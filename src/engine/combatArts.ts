/** S1-1 stable IDs. Learned = permanent weapon XP; equipped = two preparation slots. */
import type {WeaponCategory,WeaponRank} from "./equipmentTypes.ts";
import type {WeaponExperience} from "./proficiency.ts";
import {meetsWeaponRank} from "./proficiency.ts";
export const ART_SLOTS=2;
export type CombatArt={id:string;name:string;category:WeaponCategory;rank:WeaponRank;
  cost:number;description:string;hitBonus:number;damageBonus:number;
  noFollowUp:boolean;stationary?:boolean;target:"enemy"|"ally";
  effect?:"slow"|"weakArmor"|"evasion"|"wardArmor"};
export const COMBAT_ARTS={
 "swift-blade":{id:"swift-blade",name:"疾刃",category:"sword",rank:"D",cost:3,
  description:"首击命中+10，伤害-1",hitBonus:10,damageBonus:-1,noFollowUp:false,target:"enemy"},
 "intercept-thrust":{id:"intercept-thrust",name:"截步刺",category:"lance",rank:"D",cost:4,
  description:"首击命中施加缓足",hitBonus:0,damageBonus:0,noFollowUp:false,effect:"slow",target:"enemy"},
 "armor-sunder":{id:"armor-sunder",name:"裂甲击",category:"axe",rank:"D",cost:4,
  description:"对重甲首击伤害+2；禁止追击",hitBonus:0,damageBonus:0,noFollowUp:true,target:"enemy"},
 "steady-shot":{id:"steady-shot",name:"定点射",category:"bow",rank:"D",cost:3,
  description:"未主动移动：首击命中+15、伤害+1；禁止追击",
  hitBonus:15,damageBonus:1,noFollowUp:true,stationary:true,target:"enemy"},
 "feint-punch":{id:"feint-punch",name:"虚步击",category:"gauntlet",rank:"D",cost:3,
  description:"首击伤害-1；攻击后回避+10",hitBonus:0,damageBonus:-1,
  noFollowUp:false,effect:"evasion",target:"enemy"},
 "corrosion-hex":{id:"corrosion-hex",name:"蚀弱咒",category:"dark",rank:"C",cost:2,
  description:"首击命中使目标耐物-2，耗黑法术2次",hitBonus:0,damageBonus:0,
  noFollowUp:false,effect:"weakArmor",target:"enemy"},
 "ward-prayer":{id:"ward-prayer",name:"护壁祝祷",category:"white",rank:"D",cost:2,
  description:"友军耐物+2持续一轮，耗白法术2次",hitBonus:0,damageBonus:0,
  noFollowUp:false,effect:"wardArmor",target:"ally"},
} as const satisfies Record<string,CombatArt>;
export type CombatArtId=keyof typeof COMBAT_ARTS;
export const COMBAT_ART_IDS=Object.keys(COMBAT_ARTS) as CombatArtId[];
export function isCombatArtId(id:unknown):id is CombatArtId{
 return typeof id==="string"&&Object.hasOwn(COMBAT_ARTS,id);
}
export function unlockedCombatArts(xp:WeaponExperience):CombatArtId[]{
 return COMBAT_ART_IDS.filter(id=>meetsWeaponRank(xp[COMBAT_ARTS[id].category],COMBAT_ARTS[id].rank));
}
export function validArtEquipment(ids:unknown,xp:WeaponExperience):ids is CombatArtId[]{
 return Array.isArray(ids)&&ids.length<=ART_SLOTS&&new Set(ids).size===ids.length&&
 ids.every(id=>isCombatArtId(id)&&unlockedCombatArts(xp).includes(id));
}
