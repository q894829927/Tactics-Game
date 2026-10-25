/** Original project-owned fantasy portrait silhouettes, not source-game art. */
import type {ClassId} from "../engine/classes.ts";

export type ForecastPortrait="swordsman"|"archer"|"mage"|"guardian"|"raider"|"commander";
export function forecastPortraitFor(classId:ClassId,team:"ally"|"enemy"):string{
  if(classId==="commander")return "commander.svg";
  if(team==="enemy" && (classId==="raider"||classId==="axeFighter"||
    classId==="formationBreaker"))return "raider.svg";
  if(classId==="archer"||classId==="eliteMarksman"||classId==="scout")return "archer.svg";
  if(classId==="mage"||classId==="acolyte"||classId==="arcanist"||
    classId==="healer")return "mage.svg";
  if(classId==="sentinel"||classId==="lancer"||classId==="rider"||
    classId==="roverCavalry"||classId==="flier")return "guardian.svg";
  if(classId==="raider"&&team==="enemy")return "raider.svg";
  if(classId==="sword"||classId==="duelist"||classId==="scout")return "swordsman.svg";
  return team==="enemy"?"raider.svg":"swordsman.svg";
}
