import {WEAPON_CATEGORIES,WEAPON_RANKS,type WeaponCategory,type WeaponRank} from "./equipmentTypes.ts";
import {CLASS_LIBRARY,type ClassId} from "./classes.ts";

export type WeaponExperience=Record<WeaponCategory,number>;
export const WEAPON_RANK_THRESHOLDS={
  E:0,D:40,C:120,B:260,A:450,S:700,"S+":1000,
} as const satisfies Record<WeaponRank,number>;
export const MAX_WEAPON_EXP=WEAPON_RANK_THRESHOLDS["S+"];

export function emptyWeaponExperience():WeaponExperience {
  return Object.fromEntries(WEAPON_CATEGORIES.map(category=>[category,0])) as WeaponExperience;
}
export function weaponRankForExp(xp:number):WeaponRank {
  const value=Number.isFinite(xp)?Math.max(0,Math.floor(xp)):0;
  for(let i=WEAPON_RANKS.length-1;i>=0;i--){
    const rank=WEAPON_RANKS[i]!;
    if(value>=WEAPON_RANK_THRESHOLDS[rank])return rank;
  }
  return "E";
}
export function meetsWeaponRank(xp:number,required:WeaponRank):boolean {
  return Number.isFinite(xp) && xp>=WEAPON_RANK_THRESHOLDS[required];
}
export function weaponExpForStartingRank(rank:WeaponRank):number {
  return WEAPON_RANK_THRESHOLDS[rank];
}

/** The first listed category is the current class's primary specialization.
 * All existing active classes are single-category. Future hybrids may define
 * dedicated primary choices in C1 without altering this XP data format.
 */
export function weaponExperienceGain(classId:ClassId,category:WeaponCategory,base:number):number {
  if(!Number.isSafeInteger(base)||base<=0)return 0;
  const primary=CLASS_LIBRARY[classId].weaponCategories[0];
  return Math.ceil(base*(primary===category?1.25:1));
}
export function awardWeaponExperience(
  experience:WeaponExperience,classId:ClassId,category:WeaponCategory,base:number,
):{gained:number;from:WeaponRank;to:WeaponRank}{
  const old=Math.min(MAX_WEAPON_EXP,Math.max(0,Math.floor(experience[category]||0)));
  const from=weaponRankForExp(old);
  const next=Math.min(MAX_WEAPON_EXP,old+weaponExperienceGain(classId,category,base));
  experience[category]=next;
  return {gained:next-old,from,to:weaponRankForExp(next)};
}
export function weaponExperienceText(experience:WeaponExperience,category:WeaponCategory):string {
  const xp=Math.max(0,experience[category]??0),rank=weaponRankForExp(xp);
  if(rank==="S+")return "熟练 S+ · "+MAX_WEAPON_EXP+" (MAX)";
  const next=WEAPON_RANKS[WEAPON_RANKS.indexOf(rank)+1]!;
  return "熟练 "+rank+" · "+xp+"/"+WEAPON_RANK_THRESHOLDS[next];
}
