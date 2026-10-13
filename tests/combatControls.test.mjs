import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
const main=readFileSync(new URL("../src/main.ts",import.meta.url),"utf8");

test("player control is restored when combat animation finishes or is skipped",()=>{
  assert.match(board,/onCombatPresentationEnded: \(\(\)=>void\) \| null = null/);
  assert.match(board,/this\.combatPlaying=false;[\s\S]*?this\.refresh\(\);[\s\S]*?this\.onCombatPresentationEnded\?\.\(\)/);
  assert.match(main,/board\.onCombatPresentationEnded=\(\)=>renderSelection\(\)/);
  assert.match(main,/battle\.phase !== "player" \|\| endingTurn \|\| board\.isAnimating/);
});

test("selection cancellation and map dragging reject both movement and combat playback",()=>{
  assert.match(board,/cancelAction\(\): boolean \{[\s\S]*?if \(this\.isAnimating \|\| this\.battle\.phase !== "player"\) return false;/);
  assert.match(board,/private startDrag\(e: PointerEvent\): void \{[\s\S]*?if \(this\.isAnimating \|\| this\.battle\.phase !== "player"\) return;/);
  assert.match(board,/private moveDrag\(e: PointerEvent\): void \{[\s\S]*?this\.isAnimating/);
  assert.match(board,/private finishDrag\(e: PointerEvent, cancelled = false\): void \{[\s\S]*?!this\.isAnimating/);
});
