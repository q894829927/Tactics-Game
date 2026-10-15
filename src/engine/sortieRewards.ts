/** C2-1 deterministic prototype sortie economy.
 * Rewards belong to the single terminal battle transition only.
 * No random examination outcomes, enemy-kill farming, or defeat payout.
 */
import type {GameResult} from "./battle.ts";
import type {PreparationFunds} from "./classCertification.ts";

export type SortieReward={
  gold:number;reputation:number;vouchers:{intermediate:number};
};
export const REWARD_VICTORY:Readonly<SortieReward>={
  gold:200,reputation:40,vouchers:{intermediate:1},
};
export const REWARD_DEFEAT:Readonly<SortieReward>={
  gold:0,reputation:0,vouchers:{intermediate:0},
};
export const RESOURCE_CAPS={
  gold:100000000,reputation:100000000,intermediate:100000,
} as const;
export function calculateSortieReward(result:Exclude<GameResult,"playing">):SortieReward {
  const reward=result==="victory"?REWARD_VICTORY:REWARD_DEFEAT;
  return {gold:reward.gold,reputation:reward.reputation,
    vouchers:{intermediate:reward.vouchers.intermediate}};
}
/** Clamp to the same bounds as CampaignSave validation. */
export function creditSortieReward(
  funds:PreparationFunds,reward:SortieReward,
):{funds:PreparationFunds;awarded:SortieReward}{
  const safe=(amount:number)=>Number.isSafeInteger(amount)?Math.max(0,amount):0;
  const award=(balance:number,amount:number,cap:number)=>
    Math.min(safe(amount),Math.max(0,cap-safe(balance)));
  const granted={
    gold:award(funds.gold,reward.gold,RESOURCE_CAPS.gold),
    reputation:award(funds.reputation,reward.reputation,RESOURCE_CAPS.reputation),
    vouchers:{intermediate:award(funds.vouchers.intermediate,
      reward.vouchers.intermediate,RESOURCE_CAPS.intermediate)},
  };
  return {
    funds:{gold:funds.gold+granted.gold,
      reputation:funds.reputation+granted.reputation,
      vouchers:{intermediate:funds.vouchers.intermediate+granted.vouchers.intermediate}},
    awarded:granted,
  };
}
/** Zero-reward fallback for C2-0 pending settlements created before C2-1.
 * The existing funds were already saved; never retroactively issue a payout.
 */
export function emptySortieReward():SortieReward {
  return {gold:0,reputation:0,vouchers:{intermediate:0}};
}
