import type {Weapon} from "./equipmentTypes.ts";
import {WEAPON_LIBRARY,type WeaponId} from "./weapons.ts";

export type WeaponInstance={
  instanceId:string;
  weaponId:WeaponId;
  /** Only physical weapons have durability. Instances never share state. */
  durability:number;
  maxDurability:number;
};

export type SpellCharges=Record<string,number>;
export const BROKEN_MIGHT_PENALTY=3;
export const BROKEN_HIT_PENALTY=20;

/** Defined resources are metadata; magic spells have charges, not durability. */
export function isSpell(weapon:Weapon):boolean {
  return weapon.category==="dark"||weapon.category==="white";
}
export function makeWeaponInstance(ownerId:string,slot:number,id:WeaponId):WeaponInstance|null {
  const definition:Weapon=WEAPON_LIBRARY[id];
  if(isSpell(definition))return null;
  const max=definition.maxDurability;
  if(max===undefined||max<=0)throw Error("Physical weapon lacks durability: "+id);
  return {instanceId:ownerId+":"+slot+":"+id,weaponId:id,
    durability:max,maxDurability:max};
}
export function initialWeaponInstances(ownerId:string,ids:readonly WeaponId[]):Array<WeaponInstance|null>{
  return ids.map((id,index)=>makeWeaponInstance(ownerId,index,id));
}
export function initialSpellCharges(ids:readonly WeaponId[]):SpellCharges {
  const resources:SpellCharges={};
  for(const id of ids){
    const weapon:Weapon=WEAPON_LIBRARY[id];
    if(isSpell(weapon)){
      if(weapon.maxCharges===undefined||weapon.maxCharges<=0)
        throw Error("Spell lacks max charges: "+id);
      resources[id]=weapon.maxCharges;
    }
  }
  return resources;
}

/** The active runtime weapon's name can be overridden in isolated test duels;
 * real player equipping always picks the inventory item at equippedIndex.
 */
export function activeWeaponId(unit:{
  weapon:Weapon;inventory:readonly WeaponId[];equippedIndex:number;
}):WeaponId|undefined {
  const equipped=unit.inventory[unit.equippedIndex];
  if(equipped&&WEAPON_LIBRARY[equipped].name===unit.weapon.name)return equipped;
  return (Object.keys(WEAPON_LIBRARY) as WeaponId[])
    .find(id=>WEAPON_LIBRARY[id].name===unit.weapon.name);
}
export function activeInstance(unit:{
  weapon:Weapon;inventory:readonly WeaponId[];equippedIndex:number;
  weaponInstances:readonly (WeaponInstance|null)[];
}):WeaponInstance|null {
  const id=activeWeaponId(unit),index=unit.equippedIndex;
  if(!id||unit.inventory[index]!==id)return null;
  const instance=unit.weaponInstances[index];
  return instance?.weaponId===id ? instance : null;
}
export function resourceWeapon(unit:{
  weapon:Weapon;inventory:readonly WeaponId[];equippedIndex:number;
  weaponInstances:readonly (WeaponInstance|null)[];
}):Weapon {
  const instance=activeInstance(unit);
  if(!instance||instance.durability>0)return unit.weapon;
  return {...unit.weapon,might:Math.max(0,unit.weapon.might-BROKEN_MIGHT_PENALTY),
    hit:Math.max(0,unit.weapon.hit-BROKEN_HIT_PENALTY)};
}
export function remainingSpellCharges(unit:{
  weapon:Weapon;inventory:readonly WeaponId[];equippedIndex:number;spellCharges:SpellCharges;
}):number|null {
  if(!isSpell(unit.weapon))return null;
  const id=activeWeaponId(unit);
  if(!id)return 0;
  const count=unit.spellCharges[id];
  // Old isolated battle fixture code replaces .weapon without equipping via UI:
  // use metadata until its first committed cast initializes the counter.
  return count===undefined ? ((WEAPON_LIBRARY[id] as Weapon).maxCharges??0) : count;
}
export function canUseAttack(unit:Parameters<typeof remainingSpellCharges>[0]):boolean {
  const count=remainingSpellCharges(unit);
  return count===null||count>0;
}
export function consumeSpellCast(unit:Parameters<typeof remainingSpellCharges>[0]):boolean {
  const count=remainingSpellCharges(unit);
  if(count===null||count<=0)return false;
  const id=activeWeaponId(unit);
  if(!id)return false;
  unit.spellCharges[id]=count-1;
  return true;
}

/** Atomic-only call from a committed combat art, never in preview. */
export function consumeArtDurability(
  unit:Parameters<typeof activeInstance>[0],cost:number,
):boolean {
  if(!Number.isSafeInteger(cost)||cost<=0)return false;
  const instance=activeInstance(unit);
  if(!instance||instance.durability<cost)return false;
  instance.durability-=cost;
  return true;
}
export function canUseArt(unit:Parameters<typeof activeInstance>[0],cost:number):boolean{
  const instance=activeInstance(unit);
  return !!instance&&Number.isSafeInteger(cost)&&cost>0&&instance.durability>=cost;
}

/** Per-instance repair amount, offered to future battle-preparation UI. */
export function repairWeapon(instance:WeaponInstance,amount:number):number {
  if(!Number.isSafeInteger(amount)||amount<=0)return 0;
  const restored=Math.min(Math.max(0,instance.maxDurability-instance.durability),amount);
  instance.durability+=restored;
  return restored;
}
export function refillSpells(charges:SpellCharges,ids:readonly WeaponId[]):void{
  for(const [id,count] of Object.entries(initialSpellCharges(ids)))
    charges[id]=count;
}

/** Read-only text for both weapon pickers and the unit inspector. */
export function weaponResourceText(unit:{
  inventory:readonly WeaponId[];equippedIndex:number;
  weaponInstances:readonly (WeaponInstance|null)[];spellCharges:SpellCharges;
},index:number):string {
  const id=unit.inventory[index];
  if(!id)return "";
  const definition:Weapon=WEAPON_LIBRARY[id];
  if(isSpell(definition)){
    const max=definition.maxCharges??0;
    return "次数 "+(unit.spellCharges[id]??max)+"/"+max;
  }
  const max=definition.maxDurability??0;
  const instance=unit.weaponInstances[index];
  const remaining=instance?.weaponId===id?instance.durability:max;
  return "耐久 "+remaining+"/"+max+(remaining===0?" · 已损坏":"");
}
