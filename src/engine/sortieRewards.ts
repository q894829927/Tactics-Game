/** C4-1C: deterministic chapter economy; no reward is paid outside
 * the one terminal Battle transition. Replay diversity is battle-persistent.
 */
import type {GameResult} from "./battle.ts";
import type {PreparationFunds} from "./classCertification.ts";
import {DEFAULT_LEVEL_ID,LEVEL_IDS,type LevelId} from "./levels.ts";

export type SortieReward={
  gold:number;reputation:number;vouchers:{intermediate:number};
};
export type RewardKind="first-clear"|"replay"|"defeat";
export const REWARD_VICTORY:Readonly<SortieReward>={
  gold:200,reputation:40,vouchers:{intermediate:1},
};
export const REWARD_DEFEAT:Readonly<SortieReward>={
  gold:0,reputation:0,vouchers:{intermediate:0},
};
/** Original tutorial remains 200/40/1 to preserve C2-1 early certification. */
export const FIRST_CLEAR_REWARDS:Record<LevelId,Readonly<SortieReward>>={
  "chapter-1-1":REWARD_VICTORY,
  "chapter-1-2":{gold:280,reputation:50,vouchers:{intermediate:1}},
  "chapter-1-3":{gold:340,reputation:60,vouchers:{intermediate:2}},
  "chapter-1-4":{gold:400,reputation:75,vouchers:{intermediate:2}},
};
/** Replaying one mission grants money but never repeat vouchers by itself. */
export const REPLAY_REWARDS:Record<LevelId,Readonly<SortieReward>>={
  "chapter-1-1":{gold:75,reputation:8,vouchers:{intermediate:0}},
  "chapter-1-2":{gold:100,reputation:10,vouchers:{intermediate:0}},
  "chapter-1-3":{gold:125,reputation:12,vouchers:{intermediate:0}},
  "chapter-1-4":{gold:150,reputation:15,vouchers:{intermediate:0}},
};
export const DISTINCT_REPLAYS_PER_VOUCHER=2;
export const RESOURCE_CAPS={
  gold:100000000,reputation:100000000,intermediate:100000,
} as const;
const copy=(reward:Readonly<SortieReward>):SortieReward=>({
  gold:reward.gold,reputation:reward.reputation,
  vouchers:{intermediate:reward.vouchers.intermediate},
});
export type SortieRewardPlan={
  kind:RewardKind;reward:SortieReward;nextReplayIds:LevelId[];
  repeatVoucherEarned:boolean;
};
/** Pure quote and final award calculation share exactly the same rules.
 * Only an already COMPLETED stage is treated as a replay.
 */
export function planSortieReward(result:Exclude<GameResult,"playing">,
  levelId:LevelId,completed:readonly LevelId[],replayIds:readonly LevelId[],
):SortieRewardPlan {
  if(result==="defeat")return {kind:"defeat",reward:copy(REWARD_DEFEAT),
    nextReplayIds:[...replayIds],repeatVoucherEarned:false};
  if(!completed.includes(levelId))return {kind:"first-clear",
    reward:copy(FIRST_CLEAR_REWARDS[levelId]),
    nextReplayIds:[...replayIds],repeatVoucherEarned:false};
  const replayed=replayIds.includes(levelId)?[...replayIds]:[...replayIds,levelId];
  const repeatVoucherEarned=replayed.length>=DISTINCT_REPLAYS_PER_VOUCHER;
  const reward=copy(REPLAY_REWARDS[levelId]);
  if(repeatVoucherEarned)reward.vouchers.intermediate++;
  return {kind:"replay",reward,
    nextReplayIds:repeatVoucherEarned?[]:replayed,
    repeatVoucherEarned};
}
/** Legacy C2-1 API retained for callers expecting first-map base reward. */
export function calculateSortieReward(result:Exclude<GameResult,"playing">):SortieReward{
  return planSortieReward(result,DEFAULT_LEVEL_ID,[],[]).reward;
}
export function firstChapterCertificationBudget():SortieReward {
  const output=emptySortieReward();
  for(const id of LEVEL_IDS){
    const entry=FIRST_CLEAR_REWARDS[id];
    output.gold+=entry.gold;output.reputation+=entry.reputation;
    output.vouchers.intermediate+=entry.vouchers.intermediate;
  }
  return output;
}
/** Clamp at exactly the same bounds as CampaignSave validation. */
export function creditSortieReward(funds:PreparationFunds,reward:SortieReward):
 {funds:PreparationFunds;awarded:SortieReward}{
  const safe=(n:number)=>Number.isSafeInteger(n)?Math.max(0,n):0;
  const grant=(balance:number,amount:number,cap:number)=>
    Math.min(safe(amount),Math.max(0,cap-safe(balance)));
  const awarded={
    gold:grant(funds.gold,reward.gold,RESOURCE_CAPS.gold),
    reputation:grant(funds.reputation,reward.reputation,RESOURCE_CAPS.reputation),
    vouchers:{intermediate:grant(funds.vouchers.intermediate,
      reward.vouchers.intermediate,RESOURCE_CAPS.intermediate)},
  };
  return {funds:{
    gold:funds.gold+awarded.gold,
    reputation:funds.reputation+awarded.reputation,
    vouchers:{intermediate:funds.vouchers.intermediate+
      awarded.vouchers.intermediate},
  },awarded};
}
/** Pre-C2-1 settlements are already paid; no retrospective credit. */
export function emptySortieReward():SortieReward {
  return {gold:0,reputation:0,vouchers:{intermediate:0}};
}
