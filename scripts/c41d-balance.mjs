/** C4-1D: real public Battle actions, never scripted HP or victory edits. */
import {Battle} from "../src/engine/battle.ts";
import {LEVEL_IDS} from "../src/engine/levels.ts";
import {weaponFor,canWield} from "../src/engine/weapons.ts";
import {unlockedMasteries} from "../src/engine/mastery.ts";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const add=(a,b)=>a+b, key=(p)=>p.x+","+p.y;
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function groundDistance(b,src,dest){
  const queue=[{...src,d:0}],seen=new Set([key(src)]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    if(p.x===dest.x&&p.y===dest.y)return p.d;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const next={x:p.x+dx,y:p.y+dy,d:p.d+1};
      if(next.x<0||next.x>=10||next.y<0||next.y>=8||
        b.tile(next.x,next.y)==="#"||seen.has(key(next)))continue;
      seen.add(key(next));queue.push(next);
    }
  }
  return 99;
}
function choose(b,ally){
  const positions=[...b.reachable(ally).keys()].map(s=>{
    const [x,y]=s.split(",").map(Number);return {x,y};
  });
  const foes=b.alive("enemy"),opts=[];
  for(const pos of positions)for(let wi=0;wi<ally.inventory.length;wi++){
    const id=ally.inventory[wi];
    if(!canWield(ally.classId,id,ally.weaponExp))continue;
    const weapon=weaponFor(id);
    if(weapon.effect==="heal")continue;
    const projected={...ally,...pos,weapon,equippedIndex:wi};
    for(const target of foes){
      const fc=b.forecastAttack(projected,target);
      if(!fc)continue;
      const expected=(fc.damage+(fc.followUp==="attacker"?fc.followUpDamage:0))*
        fc.attackerHit/100;
      const risk=(fc.counterDamage+(fc.followUp==="defender"?fc.followUpDamage:0))*
        fc.defenderHit/100;
      const boss=b.currentLevel.victory.kind==="defeat-unit"&&
        target.id===b.currentLevel.victory.unitId;
      const score=expected*2+(fc.defenderHpAfter===0?18:0)+(boss?8:0)-
        risk*(ally.hp<14?2:0.55);
      opts.push({kind:"attack",pos,weaponIndex:wi,targetId:target.id,score});
    }
  }
  opts.sort((a,b)=>b.score-a.score||a.pos.y-b.pos.y||a.pos.x-b.pos.x);
  if(opts.length&&opts[0].score>0)return opts[0];
  const goal=b.currentLevel.victory;
  const direct=goal.kind==="reach-tile"?[{x:goal.x,y:goal.y}]:
    foes.sort((a,b)=>dist(a,ally)-dist(b,ally)).slice(0,2);
  const moves=positions.map(pos=>{
    const advance=direct.length?Math.min(...direct.map(t=>groundDistance(b,pos,t))):0;
    const danger=b.alive("enemy").reduce((n,e)=>
      n+Number(b.enemyThreat(e).attack.has(key(pos))),0);
    const standing=pos.x===ally.x&&pos.y===ally.y;
    return {pos,score:-advance*4-danger*(ally.hp<12?5:1.2)-
      (standing?3:0)+(b.tile(pos.x,pos.y)==="F"?1:0)};
  }).sort((a,b)=>b.score-a.score||a.pos.y-b.pos.y||a.pos.x-b.pos.x);
  return {kind:"wait",pos:moves[0]?.pos??{x:ally.x,y:ally.y}};
}
function advanceRound(b,totals){
  const ids=b.alive("ally").filter(u=>!u.spent).map(u=>u.id);
  for(const id of ids){
    if(b.phase!=="player"||b.result!=="playing")break;
    const ally=b.units.find(u=>u.id===id);
    if(!ally||ally.hp===0||ally.spent)continue;
    const action=choose(b,ally);
    b.click(ally.x,ally.y);
    if(b.selected?.id!==id)throw Error("Failed to select "+id);
    if(action.kind==="attack"&&action.weaponIndex!==ally.equippedIndex&&
      !b.equipWeapon(ally,action.weaponIndex))throw Error("Failed to equip "+id);
    if(action.pos.x!==ally.x||action.pos.y!==ally.y)b.click(action.pos.x,action.pos.y);
    if(action.kind==="attack"){
      const target=b.units.find(u=>u.id===action.targetId);
      b.click(target.x,target.y);
      if(ally.spent){
        totals.attacks++;
        for(const event of b.lastCombatEvents){
          if(event.fromId===id){totals.damageDealt+=event.damage;totals.hits+=Number(!event.missed);}
          if(event.toId===id)totals.damageTaken+=event.damage;
        }
      }else{totals.failedPlans++;b.waitSelected();}
    }else b.waitSelected();
    totals.actions+=Number(ally.spent);
  }
  if(b.result==="playing")b.endTurn();
}
const classXp=(units)=>units.map(u=>Object.values(u.classExperience).reduce(add,0));
const durability=(units)=>units.map(u=>u.weaponInstances.reduce((n,w)=>n+(w?.durability??0),0));
function fight(b,seed,maxRounds){
  if(!b.beginSortie())throw Error("Sortie failed "+b.selectedLevelId);
  b.setRandomSeed(seed);
  const units=b.units.filter(u=>u.team==="ally");
  const before={xp:classXp(units),durability:durability(units)};
  const totals={actions:0,attacks:0,hits:0,damageDealt:0,damageTaken:0,failedPlans:0};
  for(let i=0;i<maxRounds&&b.result==="playing";i++)advanceRound(b,totals);
  const now=b.units.filter(u=>u.team==="ally");
  return {id:b.selectedLevelId,result:b.result==="playing"?"timeout":b.result,
    rounds:b.round,standing:now.filter(u=>u.hp>0).length,...totals,
    classXpGained:classXp(now).map((n,i)=>n-before.xp[i]),
    durabilityConsumed:durability(now).map((n,i)=>before.durability[i]-n),
    masteredCount:now.reduce((n,u)=>n+unlockedMasteries(u.classExperience).length,0),
    wallet:{...b.preparationFunds,vouchers:{...b.preparationFunds.vouchers}},
    reward:b.pendingSettlement?.reward??null,rewardKind:b.pendingSettlement?.rewardKind??null};
}
function tryPromote(b,stats){
  for(const [id,job] of [["a1","duelist"],["a2","sentinel"],
    ["a3","eliteMarksman"],["a4","arcanist"]]){
    const a=b.units.find(u=>u.id===id);
    if(!a||a.classLicenses.includes(job)||!b.classStatus(a,job).eligible)continue;
    const gold=b.preparationFunds.gold;
    if(b.changeClass(id,job))stats.certifications.push({id,job,cost:gold-b.preparationFunds.gold});
  }
}
export function simulateCampaign({seed=7,mode="base",grind=0,maxRounds=35}={}){
  const b=new Battle({campaign:true});
  const stats={seed,mode,grind,stages:[],replays:[],certifications:[],blockedAt:null};
  for(let i=0;i<LEVEL_IDS.length;i++){
    if(i>0){
      if(!b.returnToPreparation()||!b.selectLevel(LEVEL_IDS[i]))
        throw Error("Stage locked despite preceding victory");
    }
    if(mode==="promotion")tryPromote(b,stats);
    const stage=fight(b,(seed+101*i)>>>0,maxRounds);
    stats.stages.push(stage);
    if(stage.result!=="victory"){stats.blockedAt=stage.id;break;}
    if(i===0&&grind>0)for(let n=0;n<grind;n++){
      if(!b.returnToPreparation()||!b.selectLevel(LEVEL_IDS[0]))
        throw Error("Could not begin legitimate replay");
      if(mode==="promotion")tryPromote(b,stats);
      const replay=fight(b,(seed+701+n)>>>0,maxRounds);
      stats.replays.push(replay);
      if(replay.result!=="victory"){stats.blockedAt="replay-"+n;break;}
    }
    if(stats.blockedAt)break;
  }
  stats.cleared=stats.stages.length===LEVEL_IDS.length&&stats.stages.every(s=>s.result==="victory");
  stats.totalRounds=[...stats.stages,...stats.replays].reduce((n,s)=>n+s.rounds,0);
  stats.completedLevels=[...b.completedLevelIds];
  stats.wallet={gold:b.preparationFunds.gold,reputation:b.preparationFunds.reputation,
    vouchers:b.preparationFunds.vouchers.intermediate};
  stats.classXp=b.units.filter(u=>u.team==="ally").map(u=>({
    id:u.id,classId:u.classId,experience:{...u.classExperience},
    mastered:unlockedMasteries(u.classExperience)}));
  return stats;
}
export function summarize(samples){
  const completed=samples.filter(s=>s.cleared),noGrind=samples.filter(s=>s.grind===0);
  const perLevel=Object.fromEntries(LEVEL_IDS.map(id=>{
    const turns=samples.flatMap(s=>s.stages.filter(x=>x.id===id&&x.result==="victory").map(x=>x.rounds));
    return [id,{wins:turns.length,meanTurns:turns.length?
      Number((turns.reduce(add,0)/turns.length).toFixed(2)):null,
      minTurns:turns.length?Math.min(...turns):null,
      maxTurns:turns.length?Math.max(...turns):null}];
  }));
  return {samples:samples.length,fullClears:completed.length,
    noGrindAttempts:noGrind.length,noGrindClears:noGrind.filter(s=>s.cleared).length,
    perLevel};
}
function markdown(summary,samples){
  const table=LEVEL_IDS.map(id=>{
    const x=summary.perLevel[id];
    return "| "+id+" | "+x.wins+" | "+(x.meanTurns??"无样本")+" | "+
      (x.minTurns??"—")+"–"+(x.maxTurns??"—")+" |";
  }).join("\n");
  const full=samples.filter(s=>s.cleared).map(s=>({
    seed:s.seed,mode:s.mode,grind:s.grind,turns:s.totalRounds,
    wallet:s.wallet,certifications:s.certifications,masteries:s.classXp.map(u=>u.mastered.length)
  }));
  return "# C4-1D 四关实战经济与培养报告\n\n"+
    "实验采用 Battle 公共接口与固定种子，没有直接设置生命、等级、金币或通关。\n\n"+
    "- 场次："+summary.samples+"\n- 四关完成："+summary.fullClears+
    "\n- 无刷关完成："+summary.noGrindClears+"/"+summary.noGrindAttempts+
    "\n- 注意：这是贪心自动策略，不等于真人胜率。失败不能证明关卡无法通关。\n\n"+
    "| 关卡 | 成功场次 | 平均回合 | 最少–最多 |\n|---|---:|---:|---|\n"+table+
    "\n\n## 实际完成样本的经济与精通\n\n"+
    (full.length?JSON.stringify(full,null,2):"无完整通关样本，不能断言金币足够或必须刷关。")+
    "\n\n## 未覆盖因素\n\n当前策略未使用治疗或高级战技；维修、商店未实现。多种子结果为可复现基线，经济调优前应引入真实通关样本。\n";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const samples=[7,19,37,73].flatMap(seed=>[
    simulateCampaign({seed,mode:"base"}),
    simulateCampaign({seed,mode:"promotion"}),
    simulateCampaign({seed,mode:"promotion",grind:2})
  ]);
  const summary=summarize(samples);
  mkdirSync("balance-artifacts",{recursive:true});
  writeFileSync("balance-artifacts/c41d-metrics.json",JSON.stringify({summary,samples},null,2)+"\n");
  writeFileSync("balance-artifacts/c41d-report.md",markdown(summary,samples));
  process.stdout.write(JSON.stringify(summary,null,2)+"\n");
}
