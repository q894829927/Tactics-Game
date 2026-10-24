/** E1-2 equipment management: purely derived prices and typed shared storage. */
import {WEAPON_LIBRARY,type WeaponId} from "./weapons.ts";
import {shopPrice} from "./campShop.ts";
import type {WeaponInstance} from "./combatResources.ts";

export const WAREHOUSE_CAPACITY=40;
export const WAREHOUSE_SERIAL_CAP=1000000000;
export const GOLD_CAP=100000000;
export type StoredEquipment={
  entryId:number;
  weaponId:WeaponId;
  instance:WeaponInstance|null;
  /** Magic charges follow the scroll; physical weapons store null. */
  charges:number|null;
};
export function sellWeaponValue(
  weaponId:WeaponId,instance:WeaponInstance|null,
):number|null{
  const listPrice=shopPrice(weaponId);
  if(listPrice===null)return null;
  const weapon=WEAPON_LIBRARY[weaponId];
  if(weapon.kind==="magical")return Math.floor(listPrice/2);
  if(!instance||instance.weaponId!==weaponId||
     instance.maxDurability!==weapon.maxDurability||
     !Number.isSafeInteger(instance.durability)||instance.durability<0||
     instance.durability>instance.maxDurability)return null;
  // Sale never refunds more than half the new purchase price.
  return Math.floor(listPrice*instance.durability/instance.maxDurability/2);
}
