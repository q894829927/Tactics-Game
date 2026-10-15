/** C3 independent per-character job progress and inheritable passive mastery.
 * All mastery effects are explicit, deterministic and only work when equipped.
 */
import {CLASS_LIBRARY,type ClassId} from "./classes.ts";
import type {CombatStats} from "./attributes.ts";
export const MASTERY_SLOTS=2;
export const MASTERY_LIBRARY={
  swordFocus:{name:"剑术专注",description:"命中 +5",effect:"hit",amount:5},
  lanceGuard:{name:"枪卫架势",description:"物理防护 +1",effect:"physicalProtection",amount:1},
  axePrecision:{name:"斧刃锐意",description:"必杀 +3",effect:"crit",amount:3},
  bowFocus:{name:"远射专注",description:"命中 +8",effect:"hit",amount:8},
  brawlerStep:{name:"身法",description:"回避 +5",effect:"avoid",amount:5},
  mageWard:{name:"魔力护幕",description:"魔法防护 +1",effect:"magicalProtection",amount:1},
  acolyteFaith:{name:"祈愿",description:"必杀回避 +5",effect:"critAvoid",amount:5},
  duelistTempo:{name:"迅疾",description:"攻击速度 +1",effect:"attackSpeed",amount:1},
  sentinelGuard:{name:"坚守",description:"物理防护 +2",effect:"physicalProtection",amount:2},
} as const;
export type MasteryId=keyof typeof MASTERY_LIBRARY;
export type ClassExperience=Partial<Record<ClassId,number>>;
export const masteryThreshold=(id:ClassId):number=>CLASS_LIBRARY[id].masteryThreshold;
export function classExperienceFor(exp:ClassExperience,id:ClassId):number{
  return Math.min(masteryThreshold(id),Math.max(0,exp[id]??0));
}
export function classMastered(exp:ClassExperience,id:ClassId):boolean {
  return classExperienceFor(exp,id)>=masteryThreshold(id);
}
export function unlockedMasteries(exp:ClassExperience):MasteryId[]{
  const all=new Set<MasteryId>();
  for(const id of Object.keys(CLASS_LIBRARY) as ClassId[])
    if(classMastered(exp,id))
      for(const skill of CLASS_LIBRARY[id].masteryRewardIds)
        if(Object.hasOwn(MASTERY_LIBRARY,skill))all.add(skill as MasteryId);
  return [...all];
}
export function gainClassExperience(exp:ClassExperience,id:ClassId,amount:number):
  {gained:number;mastered:boolean}{
  const before=classExperienceFor(exp,id);
  if(!Number.isFinite(amount)||amount<=0)return {gained:0,mastered:false};
  const after=Math.min(masteryThreshold(id),before+Math.floor(amount));
  exp[id]=after;
  return {gained:after-before,mastered:before<masteryThreshold(id)&&after===masteryThreshold(id)};
}
export function applyEquippedMasteries(base:CombatStats,ids:readonly MasteryId[]):CombatStats{
  const stats={...base};
  for(const id of ids){
    const mastery=MASTERY_LIBRARY[id];
    if(!mastery)continue;
    const property=mastery.effect;
    stats[property]+=mastery.amount;
  }
  return stats;
}
