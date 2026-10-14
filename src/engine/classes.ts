import type {BasicKey,GrowthKey} from "./attributes.ts";
import type {WeaponCategory,WeaponRank} from "./equipmentTypes.ts";

export type ClassTier="basic"|"intermediate"|"advanced"|"master"|"legacy";
export type ClassDefinition={
  name:string; emblem:string; portrait:string; tier:ClassTier;
  weaponCategories:readonly WeaponCategory[];
  requiredWeaponRanks:Partial<Record<WeaponCategory,WeaponRank>>;
  statModifiers:Partial<Record<BasicKey,number>>;
  growthModifiers:Partial<Record<GrowthKey,number>>;
  movementMode:"ground"|"cavalry"|"flying";
  unitTags:readonly string[];
  innateAbilityIds:readonly string[];
  masteryRewardIds:readonly string[];
  masteryThreshold:number;
};
/** F0: only the existing class behaviors are active; zero modifiers mean
 * identical current stats. New gauntlet/white classes are dormant metadata.
 * Their certification, proficiency and abilities belong to C1/P1/S1.
 */
export const CLASS_LIBRARY={
  sword:{name:"剑士",emblem:"剑",portrait:"⚔",tier:"basic",
    weaponCategories:["sword"],requiredWeaponRanks:{sword:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  lancer:{name:"枪卫",emblem:"枪",portrait:"♞",tier:"basic",
    weaponCategories:["lance"],requiredWeaponRanks:{lance:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  archer:{name:"弓手",emblem:"弓",portrait:"➶",tier:"basic",
    weaponCategories:["bow"],requiredWeaponRanks:{bow:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  mage:{name:"术士",emblem:"术",portrait:"✦",tier:"basic",
    weaponCategories:["dark"],requiredWeaponRanks:{dark:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  raider:{name:"步兵",emblem:"兵",portrait:"⚔",tier:"basic",
    weaponCategories:["axe"],requiredWeaponRanks:{axe:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  commander:{name:"指挥官",emblem:"将",portrait:"♜",tier:"basic",
    weaponCategories:["sword"],requiredWeaponRanks:{sword:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  // Future templates, not available in the current battle or player menu.
  brawler:{name:"拳斗士",emblem:"拳",portrait:"✊",tier:"basic",
    weaponCategories:["gauntlet"],requiredWeaponRanks:{gauntlet:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
  acolyte:{name:"见习祭司",emblem:"愈",portrait:"✧",tier:"basic",
    weaponCategories:["white"],requiredWeaponRanks:{white:"E"},
    statModifiers:{},growthModifiers:{},movementMode:"ground",unitTags:[],
    innateAbilityIds:[],masteryRewardIds:[],masteryThreshold:80},
} as const satisfies Record<string,ClassDefinition>;
export type ClassId=keyof typeof CLASS_LIBRARY;

/** Authoritative class category permission; does not check weapon rank in F0. */
export function classAllowsWeapon(classId:ClassId,category:WeaponCategory):boolean {
  return CLASS_LIBRARY[classId]?.weaponCategories.some(value=>value===category)??false;
}
