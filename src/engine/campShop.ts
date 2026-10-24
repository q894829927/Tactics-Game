/**
 * E1-1 finite equipment shop: deterministic per-item prices, no hidden stock RNG.
 * Only actually implemented weapon/spell definitions are offered, not consumables.
 * All monetary and inventory mutations belong to Battle.prepareBuyWeapon().
 */
import {WEAPON_LIBRARY,canWield,MAX_INVENTORY,type WeaponId} from "./weapons.ts";
import type {ClassId} from "./classes.ts";
import {classAllowsWeapon} from "./classes.ts";
import type {WeaponExperience} from "./proficiency.ts";
import {weaponRankForExp} from "./proficiency.ts";

export const CAMP_SHOP_STOCK=[
 "iron-sword","slim-sword","steel-sword",
 "iron-lance","javelin","steel-lance",
 "iron-axe","hand-axe","steel-axe",
 "iron-bow","long-bow","steel-bow",
 "training-gauntlet",
 "fire-tome","thunder-tome","wind-tome",
 "light-bolt","healing-prayer",
] as const satisfies readonly WeaponId[];
export type ShopWeaponId=typeof CAMP_SHOP_STOCK[number];

const SHOP_PRICES:Readonly<Record<ShopWeaponId,number>>={
 "iron-sword":70,"slim-sword":120,"steel-sword":185,
 "iron-lance":70,"javelin":120,"steel-lance":185,
 "iron-axe":70,"hand-axe":120,"steel-axe":185,
 "iron-bow":80,"long-bow":180,"steel-bow":195,
 "training-gauntlet":75,
 "fire-tome":95,"thunder-tome":140,"wind-tome":105,
 "light-bolt":100,"healing-prayer":110,
};

export function shopPrice(id:WeaponId):number|null {
  return Object.hasOwn(SHOP_PRICES,id)?SHOP_PRICES[id as ShopWeaponId]:null;
}
export type ShopEligibility={
  id:ShopWeaponId;price:number;owned:number;slot:number|null;
  canBuy:boolean;reason:string;
};
export type ShopCandidate={
  classId:ClassId;weaponExp:WeaponExperience;inventory:readonly WeaponId[];
};
export function shopEligibility(
  buyer:ShopCandidate,id:ShopWeaponId,gold:number,
):ShopEligibility{
  const price=SHOP_PRICES[id],weapon=WEAPON_LIBRARY[id];
  const owned=buyer.inventory.filter(v=>v===id).length;
  const slot=buyer.inventory.length<MAX_INVENTORY?buyer.inventory.length:null;
  let reason="";
  if(slot===null)reason="背包已满（最多5件）";
  else if(!classAllowsWeapon(buyer.classId,weapon.category))
    reason="当前职业不能使用此武器类别";
  else if(!canWield(buyer.classId,id,buyer.weaponExp))
    reason="武器熟练度不足：需要"+weapon.requiredRank+"级，当前"+
      weaponRankForExp(buyer.weaponExp[weapon.category]);
  else if(weapon.kind==="magical"&&owned>0)
    reason="该角色已经拥有此法术（次数按法术共享）";
  else if(gold<price)reason="金币不足：需要"+price+"金币";
  return {id,price,owned,slot,canBuy:reason==="",reason:reason||"可以购买"};
}
