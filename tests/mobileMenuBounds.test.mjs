import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const board=readFileSync(new URL("../src/scene/BoardView.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
test("Single-level action menu is bounded above mobile dock even with many named spells",()=>{
 assert.match(board,/private touchDockInset\(\):number \{/);
 assert.match(board,/this\.menu\.scrollHeight\|\|300/);
 assert.match(board,/this\.viewport\.clientHeight - menuHeight - this\.touchDockInset\(\)/);
 assert.match(css,/\.unit-command-menu\{/);
 assert.match(css,/max-height:calc\(100dvh - 96px\);overflow-y:auto/);
 assert.match(css,/overscroll-behavior:contain/);
 assert.match(css,/\.command-item\{min-height:44px\}/);
});
