import type {Weapon} from "./equipmentTypes.ts";
import {CHARACTER_LIBRARY,type CharacterId} from "./characters.ts";
import {classAllowsWeapon,type ClassId} from "./classes.ts";

export const WEAPON_LIBRARY = {
  "iron-sword": {category:"sword",requiredRank:"E",maxDurability:24,name:"铁剑",kind:"physical",might:4,weight:5,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
  "steel-sword": {category:"sword",requiredRank:"C",maxDurability:20,name:"钢剑",kind:"physical",might:8,weight:12,hit:95,crit:0,dodge:0,minRange:1,maxRange:1},
  "slim-sword": {category:"sword",requiredRank:"D",maxDurability:24,name:"细剑",kind:"physical",might:2,weight:2,hit:120,crit:5,dodge:5,minRange:1,maxRange:1},
  "iron-lance": {category:"lance",requiredRank:"E",maxDurability:24,name:"铁枪",kind:"physical",might:4,weight:9,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
  "steel-lance": {category:"lance",requiredRank:"C",maxDurability:20,name:"钢枪",kind:"physical",might:8,weight:14,hit:95,crit:0,dodge:0,minRange:1,maxRange:1},
  "javelin": {category:"lance",requiredRank:"D",maxDurability:24,name:"投枪",kind:"physical",might:3,weight:10,hit:90,crit:0,dodge:0,minRange:1,maxRange:2},
  "iron-bow": {category:"bow",requiredRank:"E",maxDurability:24,name:"铁弓",kind:"physical",might:4,weight:7,hit:110,crit:0,dodge:0,minRange:2,maxRange:3},
  "steel-bow": {category:"bow",requiredRank:"C",maxDurability:20,name:"钢弓",kind:"physical",might:8,weight:12,hit:95,crit:0,dodge:0,minRange:2,maxRange:3},
  "long-bow": {category:"bow",requiredRank:"C",maxDurability:24,name:"长弓",kind:"physical",might:3,weight:10,hit:85,crit:0,dodge:0,minRange:3,maxRange:4},
  "fire-tome": {category:"dark",requiredRank:"E",maxCharges:8,name:"火焰术",kind:"magical",might:4,weight:3,hit:110,crit:0,dodge:0,minRange:1,maxRange:2},
  "thunder-tome": {category:"dark",requiredRank:"E",maxCharges:6,name:"雷电术",kind:"magical",might:6,weight:8,hit:90,crit:0,dodge:0,minRange:2,maxRange:3},
  "wind-tome": {category:"dark",requiredRank:"E",maxCharges:8,name:"风刃术",kind:"magical",might:3,weight:2,hit:115,crit:5,dodge:0,minRange:1,maxRange:2},
  "iron-axe": {category:"axe",requiredRank:"E",maxDurability:24,name:"短斧",kind:"physical",might:3,weight:7,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
  "steel-axe": {category:"axe",requiredRank:"C",maxDurability:20,name:"钢斧",kind:"physical",might:8,weight:14,hit:90,crit:0,dodge:0,minRange:1,maxRange:1},
  "hand-axe": {category:"axe",requiredRank:"D",maxDurability:24,name:"手斧",kind:"physical",might:2,weight:9,hit:90,crit:0,dodge:0,minRange:1,maxRange:2},
  "command-sword": {category:"sword",requiredRank:"E",maxDurability:24,name:"指挥剑",kind:"physical",might:4,weight:8,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
  // W1 mechanics can be exercised in real battles via the dormant F0 class
  // templates. They do not enter the existing 4v6 roster or starting bags.
  "training-gauntlet": {category:"gauntlet",requiredRank:"E",maxDurability:22,name:"练习拳套",kind:"physical",might:3,weight:2,hit:92,crit:0,dodge:0,minRange:1,maxRange:1},
  "light-bolt": {category:"white",requiredRank:"E",maxCharges:5,name:"光矢术",kind:"magical",might:3,weight:4,hit:82,crit:0,dodge:0,minRange:1,maxRange:2},
} as const satisfies Record<string, Weapon>;

export type WeaponId = keyof typeof WEAPON_LIBRARY;
export const MAX_INVENTORY=5;
/** Starting equipment belongs to an individual character, not a class. */
export function initialLoadout(characterId:CharacterId):WeaponId[] {
  return [...CHARACTER_LIBRARY[characterId].startingWeapons];
}
export function weaponFor(id:WeaponId):Weapon {
  return {...WEAPON_LIBRARY[id]};
}
/** Category permission is controlled by the current class; ranks come in P1.
 * Keep the old helper name as a compatibility API for existing callers.
 */
export function canWield(classId:ClassId,id:WeaponId):boolean {
  const weapon:Weapon|undefined=WEAPON_LIBRARY[id];
  return !!weapon && classAllowsWeapon(classId,weapon.category);
}
export function weaponRange(w:Weapon):string {
  return w.minRange===w.maxRange?String(w.minRange):w.minRange+"–"+w.maxRange;
}
