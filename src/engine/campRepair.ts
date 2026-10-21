/** E1-0: pure, deterministic equipment repair quotes.
 * Physical durability belongs to a specific instance; magic refills per sortie.
 * Coins are paid by Battle only after the entire operation is validated.
 */
import {WEAPON_LIBRARY,type WeaponId} from "./weapons.ts";
import type {WeaponInstance} from "./combatResources.ts";

export type RepairQuote={
  weaponId:WeaponId;
  missing:number;
  unitPrice:number;
  cost:number;
};

const PRICE_BY_RANK:Readonly<Record<string,number>>={
  E:2,D:3,C:4,B:5,A:6,S:7,"S+":8,
};

export function repairUnitPrice(id:WeaponId):number{
  const weapon=WEAPON_LIBRARY[id];
  return weapon.kind==="physical"?(PRICE_BY_RANK[weapon.requiredRank]??2):0;
}

export function quoteWeaponRepair(id:WeaponId,instance:WeaponInstance|null):RepairQuote|null{
  const def=WEAPON_LIBRARY[id];
  if(def.kind!=="physical"||!instance||instance.weaponId!==id||
    instance.maxDurability!==def.maxDurability||
    !Number.isSafeInteger(instance.durability)||instance.durability<0||
    instance.durability>instance.maxDurability)return null;
  const missing=instance.maxDurability-instance.durability;
  const unitPrice=repairUnitPrice(id);
  return missing>0?{weaponId:id,missing,unitPrice,cost:missing*unitPrice}:null;
}
