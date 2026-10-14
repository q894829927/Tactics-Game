/** Shared W0 rule for any offensive weapon or attacking spell.
 * Attack range, action legality and survival are validated by Battle.
 * A defender may follow up only if it was eligible to counter.
 */
export const FOLLOW_UP_AS_THRESHOLD=4;
export type FollowUpSide="attacker"|"defender"|null;

export function determineFollowUp(
  attackerAttackSpeed:number,defenderAttackSpeed:number,defenderCanCounter:boolean,
):FollowUpSide {
  const difference=attackerAttackSpeed-defenderAttackSpeed;
  if(difference>=FOLLOW_UP_AS_THRESHOLD)return "attacker";
  if(-difference>=FOLLOW_UP_AS_THRESHOLD && defenderCanCounter)return "defender";
  return null;
}
