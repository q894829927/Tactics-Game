import type {Weapon} from "./attributes.ts";

export const WEAPON_LIBRARY = {
  "iron-sword": {name:"铁剑",kind:"physical",might:4,weight:5,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
  "steel-sword": {name:"钢剑",kind:"physical",might:8,weight:12,hit:95,crit:0,dodge:0,minRange:1,maxRange:1},
  "slim-sword": {name:"细剑",kind:"physical",might:2,weight:2,hit:120,crit:5,dodge:5,minRange:1,maxRange:1},
  "iron-lance": {name:"铁枪",kind:"physical",might:4,weight:9,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
  "steel-lance": {name:"钢枪",kind:"physical",might:8,weight:14,hit:95,crit:0,dodge:0,minRange:1,maxRange:1},
  "javelin": {name:"投枪",kind:"physical",might:3,weight:10,hit:90,crit:0,dodge:0,minRange:1,maxRange:2},
  "iron-bow": {name:"铁弓",kind:"physical",might:4,weight:7,hit:110,crit:0,dodge:0,minRange:2,maxRange:3},
  "steel-bow": {name:"钢弓",kind:"physical",might:8,weight:12,hit:95,crit:0,dodge:0,minRange:2,maxRange:3},
  "long-bow": {name:"长弓",kind:"physical",might:3,weight:10,hit:85,crit:0,dodge:0,minRange:3,maxRange:4},
  "fire-tome": {name:"火焰术",kind:"magical",might:4,weight:3,hit:110,crit:0,dodge:0,minRange:1,maxRange:2},
  "thunder-tome": {name:"雷电术",kind:"magical",might:6,weight:8,hit:90,crit:0,dodge:0,minRange:2,maxRange:3},
  "wind-tome": {name:"风刃术",kind:"magical",might:3,weight:2,hit:115,crit:5,dodge:0,minRange:1,maxRange:2},
  "iron-axe": {name:"短斧",kind:"physical",might:3,weight:7,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
  "steel-axe": {name:"钢斧",kind:"physical",might:8,weight:14,hit:90,crit:0,dodge:0,minRange:1,maxRange:1},
  "hand-axe": {name:"手斧",kind:"physical",might:2,weight:9,hit:90,crit:0,dodge:0,minRange:1,maxRange:2},
  "command-sword": {name:"指挥剑",kind:"physical",might:4,weight:8,hit:110,crit:0,dodge:0,minRange:1,maxRange:1},
} as const satisfies Record<string, Weapon>;

export type WeaponId = keyof typeof WEAPON_LIBRARY;
const ROLE_LOADOUTS:Record<string,readonly WeaponId[]>={
 sword:["iron-sword","steel-sword","slim-sword"],
 lancer:["iron-lance","steel-lance","javelin"],
 archer:["iron-bow","steel-bow","long-bow"],
 mage:["fire-tome","thunder-tome","wind-tome"],
 raider:["iron-axe","steel-axe","hand-axe"],
 commander:["command-sword","steel-sword","slim-sword"],
};
export const MAX_INVENTORY=5;
export function initialLoadout(role:string):WeaponId[] {
  const ids=ROLE_LOADOUTS[role];
  if(!ids)throw Error("Unknown role "+role);
  return [...ids];
}
export function weaponFor(id:WeaponId):Weapon {
  return {...WEAPON_LIBRARY[id]};
}
export function canWield(role:string,id:WeaponId):boolean {
  return ROLE_LOADOUTS[role]?.includes(id)??false;
}
export function weaponRange(w:Weapon):string {
  return w.minRange===w.maxRange?String(w.minRange):w.minRange+"–"+w.maxRange;
}
