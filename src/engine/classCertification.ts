import {CLASS_LIBRARY,type ClassId} from "./classes.ts";
import {WEAPON_RANK_THRESHOLDS,weaponRankForExp} from "./proficiency.ts";
import type {WeaponExperience} from "./proficiency.ts";
import {WEAPON_LIBRARY,type WeaponId,canWield} from "./weapons.ts";
import type {WeaponCategory,WeaponRank} from "./equipmentTypes.ts";

export type ExamVoucher="intermediate";
export type PreparationFunds={
  reputation:number;
  gold:number;
  vouchers:Record<ExamVoucher,number>;
};
/** This is a C1 eligibility foundation, not the E1 reward/economy loop. */
export const INITIAL_PREPARATION_FUNDS:PreparationFunds={
  reputation:0,gold:0,vouchers:{intermediate:0},
};
export const PLAYER_CLASS_CHOICES=[
  "sword","lancer","axeFighter","archer","brawler","mage","acolyte",
  "duelist","sentinel","formationBreaker","eliteMarksman","martialArtist",
  "arcanist","healer","roverCavalry","scout",
] as const satisfies readonly ClassId[];
export type PlayerClassChoice=typeof PLAYER_CLASS_CHOICES[number];

/** Free basic certification; intermediate requires credentials plus an earned D rank.
 * Higher classes are design-only until their own development phases.
 */
export function certificationRequirements(id:ClassId):{
  gold:number;reputation:number;voucher:ExamVoucher|null;
}{
  const tier=CLASS_LIBRARY[id].tier;
  if(tier==="basic")return {gold:0,reputation:0,voucher:null};
  if(tier==="intermediate")return {gold:150,reputation:30,voucher:"intermediate"};
  return {gold:Infinity,reputation:Infinity,voucher:null};
}

export type CertificationStatus={eligible:boolean;reason:string;alreadyCertified:boolean};
export function classCertificationStatus(
  id:ClassId,weaponExp:WeaponExperience,licenses:readonly ClassId[],funds:PreparationFunds,
  ridingPermit=false,
):CertificationStatus {
  const alreadyCertified=licenses.includes(id);
  if(!(PLAYER_CLASS_CHOICES as readonly string[]).includes(id))
    return {eligible:false,reason:"该职业尚未对玩家开放",alreadyCertified};
  const target=CLASS_LIBRARY[id];
  if(id==="roverCavalry"&&!ridingPermit)
    return {eligible:false,reason:"需要骑乘许可（首次胜利后永久获得）",alreadyCertified};
  // "剑D或枪D" is one specialization, not two cumulative prerequisites.
  if(id==="roverCavalry"){
    if(weaponExp.sword<WEAPON_RANK_THRESHOLDS.D&&
       weaponExp.lance<WEAPON_RANK_THRESHOLDS.D)
      return {eligible:false,reason:"需要剑D或枪D熟练度",alreadyCertified};
  }
  for(const [category,rank] of Object.entries(target.requiredWeaponRanks)){
    if(id==="roverCavalry")break;
    if(!rank)continue;
    const current=weaponExp[category as WeaponCategory]??0;
    if(current<WEAPON_RANK_THRESHOLDS[rank as WeaponRank]){
      return {eligible:false,reason:"需要"+category+"熟练度 "+rank+
        "（当前 "+weaponRankForExp(current)+"）",alreadyCertified};
    }
  }
  if(alreadyCertified)return {eligible:true,reason:"已认证 · 切换免费",alreadyCertified};
  const required=certificationRequirements(id);
  if(funds.reputation<required.reputation)
    return {eligible:false,reason:"需要名声 "+required.reputation,alreadyCertified};
  if(required.voucher&&funds.vouchers[required.voucher]<1)
    return {eligible:false,reason:"需要中级考试凭证",alreadyCertified};
  if(funds.gold<required.gold)
    return {eligible:false,reason:"需要金币 "+required.gold,alreadyCertified};
  return {eligible:true,reason:required.gold
    ? "认证消耗 "+required.gold+" 金币和中级考试凭证":"初级认证免费",alreadyCertified};
}
export const CLASS_TRAINING_WEAPONS:Record<WeaponCategory,WeaponId>={
  sword:"iron-sword",lance:"iron-lance",axe:"iron-axe",bow:"iron-bow",
  gauntlet:"training-gauntlet",dark:"fire-tome",white:"healing-prayer",
};
/** A basic loaner is kept in a single replaceable slot, never duplicates items.
 * No rental replaces an owned weapon, and training gear is not transferable.
 */
export function loanerForClass(id:ClassId,exp:WeaponExperience):WeaponId|null {
  for(const category of CLASS_LIBRARY[id].weaponCategories){
    const weapon=CLASS_TRAINING_WEAPONS[category];
    if(weapon&&canWield(id,weapon,exp))return weapon;
  }
  return null;
}
export function classWeaponAvailable(id:ClassId,inventory:readonly WeaponId[],
  exp:WeaponExperience):boolean{
  return inventory.some(weapon=>canWield(id,weapon,exp))||loanerForClass(id,exp)!==null;
}
