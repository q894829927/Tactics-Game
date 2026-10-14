import type {Weapon,WeaponCategory} from "./equipmentTypes.ts";
import {CLASS_LIBRARY,type ClassId} from "./classes.ts";

export type UnitTag="Cavalry"|"Flying"|"Armored";

const SWORD_FOLLOW_UP_NUMERATOR=6; // 1.2 = 6/5, integer-only combat
const SWORD_FOLLOW_UP_DENOMINATOR=5;
export const LANCE_CAVALRY_MULTIPLIER=2;
export const BOW_FLYING_MULTIPLIER=3;
export const AXE_MINIMUM_DAMAGE=5;
export const GAUNTLET_AVOID_BONUS=15;

/** Combat tags are derived from the CURRENT class. No old role/identity lookup.
 * No cavalry/flying terrain movement is added in W1.
 */
export function classCombatTags(classId:ClassId):ReadonlySet<UnitTag> {
  const cls=CLASS_LIBRARY[classId];
  const tags=new Set<UnitTag>();
  for(const tag of cls.unitTags){
    if(tag==="Cavalry"||tag==="Flying"||tag==="Armored")tags.add(tag);
  }
  if(cls.movementMode==="cavalry")tags.add("Cavalry");
  if(cls.movementMode==="flying")tags.add("Flying");
  return tags;
}

/** Effectiveness multiplies WEAPON MIGHT only, never strength or final damage. */
export function effectiveMight(weapon:Weapon,targetClassId:ClassId):number {
  const tags=classCombatTags(targetClassId);
  if(weapon.category==="lance"&&tags.has("Cavalry"))
    return weapon.might*LANCE_CAVALRY_MULTIPLIER;
  if(weapon.category==="bow"&&tags.has("Flying"))
    return weapon.might*BOW_FLYING_MULTIPLIER;
  return weapon.might;
}

/** The gauntlet's evasion applies to directly targeted non-gauntlet attacks,
 * including offensive dark/white spells; other sources of damage are excluded.
 */
export function defensiveAvoidBonus(attackCategory:WeaponCategory,defendCategory:WeaponCategory):number {
  return defendCategory==="gauntlet"&&attackCategory!=="gauntlet"?GAUNTLET_AVOID_BONUS:0;
}

/** Single source for preview and committed per-strike damage.
 * Axe floor is on HIT only (caller must check the hit roll first).
 * Sword x1.2 applies to the actual follow-up strike after critical x3.
 */
export function strikeDamage(baseDamage:number,category:WeaponCategory,critical=false,followUp=false):number {
  let damage=Math.max(0,Math.floor(baseDamage));
  if(category==="axe")damage=Math.max(AXE_MINIMUM_DAMAGE,damage);
  if(critical)damage*=3;
  if(category==="sword"&&followUp)
    damage=Math.floor(damage*SWORD_FOLLOW_UP_NUMERATOR/SWORD_FOLLOW_UP_DENOMINATOR);
  return damage;
}

/** UI text corresponds to data the combat engine actually applies. */
export function traitLabel(weapon:Weapon,targetClassId:ClassId,followUp=false):string {
  const tags=classCombatTags(targetClassId);
  if(weapon.category==="lance"&&tags.has("Cavalry"))return "骑乘特效 ×2";
  if(weapon.category==="bow"&&tags.has("Flying"))return "飞行特效 ×3";
  if(weapon.category==="axe")return "命中伤害保底 5";
  if(weapon.category==="gauntlet")return "受非拳套攻击回避 +15";
  if(weapon.category==="sword"&&followUp)return "剑追击伤害 ×1.2";
  if(weapon.category==="dark")return "黑魔法 · 魔防结算";
  if(weapon.category==="white")return "白魔法攻击 · 魔防结算";
  return "";
}
