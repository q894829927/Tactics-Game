/** C4 current-class innate and conditional inherited mastery evaluation.
 * Read-only helpers called by both battle forecast and committed strikes.
 */
import type {Unit} from "./battle.ts";
import type {Terrain} from "./terrain.ts";
import {effectiveClassStats} from "./classes.ts";
import {classCombatTags} from "./weaponTraits.ts";
export const INNATE_DESCRIPTIONS={
 focus:"专注：主动普通攻击命中+5",
 neighborGuard:"邻卫：相邻友军时自身耐物+1",
 aim:"瞄准：未主动移动时主动弓攻击命中+8",
 hexSense:"识咒：黑魔攻击带减益目标伤害+1",
 loneFist:"孤斗：无相邻友军时回避+8",
 firstPrayer:"初心祷告：有效治疗量+2",
 bravery:"勇猛：打防守≥8目标命中+8",
 nimble:"灵活：主动近战后对该目标回避+8至下一本方阶段",
 holdGround:"固守：未移动时近战物伤-2",
 breakFormation:"破阵：对防守≥8目标命中+10",
 stillAim:"稳射：未主动移动时弓命中+10",
 counterPose:"反身：闪避后下次主动伤害+1",
 etching:"蚀刻：黑魔攻击带减益目标伤害+2",
 benevolence:"仁护：有效治疗量+3",
 charge:"奔袭：移动≥3格后主动首击命中+5",
 forestCover:"林荫：森林回避+10",
} as const;
export function adjacentAlly(u:Unit,units:readonly Unit[]):boolean{
 return units.some(v=>u.id!==v.id&&u.team===v.team&&v.hp>0&&
  Math.abs(u.x-v.x)+Math.abs(u.y-v.y)===1);
}
export function hasDebuff(u:Unit):boolean{
 return u.statuses.some(s=>["burn","slow","weakArmor","weakMagic","mark"].includes(s.kind));
}
export function innateHitBonus(u:Unit,target:Unit,active:boolean,normal:boolean):number{
 if(!active)return 0;
 const defense=effectiveClassStats(target.stats,target.classId).defense;
 switch(u.classId){
 case "sword":return normal?5:0;
 case "axeFighter":return defense>=8?8:0;
 case "archer":return !u.moved&&u.weapon.category==="bow"?8:0;
 case "formationBreaker":return defense>=8?10:0;
 case "eliteMarksman":return !u.moved&&u.weapon.category==="bow"?10:0;
 case "roverCavalry":return u.movedTiles>=3?5:0;
 default:return 0;
 }
}
export function inheritedHitBonus(u:Unit,target:Unit,active:boolean):number{
 if(!active)return 0;
 return (u.equippedMasteries.includes("steadyAim")&&
  Math.abs(u.x-target.x)+Math.abs(u.y-target.y)>1?5:0)+
  (u.equippedMasteries.includes("slipFocus")&&u.focusReady?5:0);
}
export function innateDamageBonus(u:Unit,to:Unit,active:boolean):number{
 let bonus=0;
 if(u.weapon.kind==="magical"&&hasDebuff(to)){
  if(u.classId==="mage")bonus++;
  if(u.classId==="arcanist")bonus+=2;
 }
 if(active){
  if(u.classId==="martialArtist"&&u.focusReady)bonus++;
  if(u.equippedMasteries.includes("armorDrill")&&
    classCombatTags(to.classId).has("Armored"))bonus++;
  if(u.equippedMasteries.includes("ridingCharge")&&u.movedTiles>=3)bonus++;
 }
 return bonus;
}
export function innateHealBonus(u:Unit):number{
 return (u.classId==="acolyte"?2:0)+(u.classId==="healer"?3:0)+
  (u.equippedMasteries.includes("healingHeart")?2:0);
}
export function innateAvoid(u:Unit,units:readonly Unit[],terrain:Terrain):number{
 return (u.classId==="brawler"&&!adjacentAlly(u,units)?8:0)+
  (u.classId==="scout"&&terrain==="F"?10:0);
}
export function innatePhysicalProtection(u:Unit,units:readonly Unit[]):number{
 return u.classId==="lancer"&&adjacentAlly(u,units)?1:0;
}
export function innateReduction(from:Unit,to:Unit):number{
 return to.classId==="sentinel"&&!to.moved&&from.weapon.kind==="physical"&&
  Math.abs(from.x-to.x)+Math.abs(from.y-to.y)===1?2:0;
}
export function terrainStepCost(u:Unit,t:Terrain,base:number):number{
 if(!Number.isFinite(base))return base;
 let cost=base;
 if(u.classId==="roverCavalry"&&(t==="F"||t==="H"))cost++;
 if(t==="F"&&u.equippedMasteries.includes("forestWalker"))cost--;
 return Math.max(1,cost);
}
