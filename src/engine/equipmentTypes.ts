/** Stable weapon families. Category is independent of damage type and current class. */
export const WEAPON_CATEGORIES=[
  "sword","lance","axe","bow","gauntlet","dark","white",
] as const;
export type WeaponCategory=typeof WEAPON_CATEGORIES[number];
export const WEAPON_RANKS=["E","D","C","B","A","S","S+"] as const;
export type WeaponRank=typeof WEAPON_RANKS[number];
export type DamageType="physical"|"magical";

/** Runtime weapon stats remain mutable for the existing battle engine.
 * W2 stores instance durability and spell charges separately from definitions.
 */
export type Weapon={
  name:string;
  category:WeaponCategory;
  kind:DamageType; // compatibility with current physical/magical damage pipeline
  requiredRank:WeaponRank; // P1 will enforce proficiency
  maxDurability?:number; // physical weapons only
  maxCharges?:number; // attacking magic only
  might:number;
  weight:number;
  hit:number;
  crit:number;
  dodge:number;
  minRange:number;
  maxRange:number;
};
