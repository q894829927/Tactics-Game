/** S1-0: immutable action specifications and all-or-nothing resource payment.
 * Future effects reuse this contract; only standard attacks and the W2 sample
 * combat art are executable in this phase.
 */
import type {Weapon} from "./equipmentTypes.ts";
import type {WeaponId} from "./weapons.ts";
import {activeInstance,activeWeaponId,isSpell,remainingSpellCharges,
  type WeaponInstance,type SpellCharges} from "./combatResources.ts";

export type ActionCost =
  | {kind:"durability";instanceId:string;amount:number}
  | {kind:"spell";spellId:WeaponId;amount:number}
  | {kind:"hp";amount:number};

export type ActionSpec={
  readonly actionId:string;
  readonly kind:"attack"|"combat-art"|"heal"|"status"|"shield";
  readonly actorId:string;
  readonly targetId:string;
  readonly weaponId:WeaponId;
  readonly equippedIndex:number;
  readonly damageBonus:number;
  readonly costs:readonly ActionCost[];
};

export type ActionResourceUser={
  weapon:Weapon;
  inventory:readonly WeaponId[];
  equippedIndex:number;
  weaponInstances:readonly (WeaponInstance|null)[];
  spellCharges:SpellCharges;
  hp:number;
};

/** The only S1-0 art is the existing W2 isolated sample.
 * Its ID is supplied by Battle, so arbitrary art IDs cannot be committed.
 */
export function makeAttackAction(actor:ActionResourceUser,actorId:string,
  targetId:string,art?:{id:string;durabilityCost:number;damageBonus:number}
):ActionSpec|null{
  const weaponId=activeWeaponId(actor);
  if(!weaponId||actor.weapon.effect==="heal")return null;
  const costs:ActionCost[]=[];
  if(art){
    if(isSpell(actor.weapon))return null;
    const instance=activeInstance(actor);
    if(!instance)return null;
    costs.push({kind:"durability",instanceId:instance.instanceId,amount:art.durabilityCost});
  }else if(isSpell(actor.weapon)){
    costs.push({kind:"spell",spellId:weaponId,amount:1});
  }
  return {actionId:art?.id??"basic-attack",kind:art?"combat-art":"attack",
    actorId,targetId,weaponId,equippedIndex:actor.equippedIndex,
    damageBonus:art?.damageBonus??0,costs};
}

export function makeSupportAction(actor:ActionResourceUser,actorId:string,
  targetId:string,kind:"heal"|"status"|"shield",charges=1):ActionSpec|null{
  const weaponId=activeWeaponId(actor);
  if(!weaponId||!isSpell(actor.weapon)||!Number.isSafeInteger(charges)||charges<=0)return null;
  return {actionId:kind,kind,actorId,targetId,weaponId,equippedIndex:actor.equippedIndex,
    damageBonus:0,costs:[{kind:"spell",spellId:weaponId,amount:charges}]};
}

/** Validates the whole payment before changing any amount.
 * Instance IDs disambiguate duplicate weapons in separate inventory slots.
 */
export function canPayActionCosts(actor:ActionResourceUser,costs:readonly ActionCost[]):boolean{
  const instance=activeInstance(actor);
  const weaponId=activeWeaponId(actor);
  const amounts=new Map<string,number>();
  for(const cost of costs){
    if(!Number.isSafeInteger(cost.amount)||cost.amount<=0)return false;
    const key=cost.kind==="durability"?"d:"+cost.instanceId:
      cost.kind==="spell"?"s:"+cost.spellId:"h";
    if(cost.kind==="durability"&&(!instance||instance.instanceId!==cost.instanceId))
      return false;
    if(cost.kind==="spell"&&(!isSpell(actor.weapon)||weaponId!==cost.spellId))
      return false;
    amounts.set(key,(amounts.get(key)??0)+cost.amount);
  }
  for(const [key,amount] of amounts){
    if(key.startsWith("d:")&&(!instance||instance.durability<amount))return false;
    if(key.startsWith("s:")&&((remainingSpellCharges(actor)??0)<amount))return false;
    if(key==="h"&&actor.hp<=amount)return false;
  }
  return true;
}
export function payActionCosts(actor:ActionResourceUser,costs:readonly ActionCost[]):boolean{
  if(!canPayActionCosts(actor,costs))return false;
  const instance=activeInstance(actor);
  for(const cost of costs){
    if(cost.kind==="durability")instance!.durability-=cost.amount;
    else if(cost.kind==="spell"){
      const current=remainingSpellCharges(actor)!;
      actor.spellCharges[cost.spellId]=current-cost.amount;
    }else actor.hp-=cost.amount;
  }
  return true;
}
