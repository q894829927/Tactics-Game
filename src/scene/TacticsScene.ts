import Phaser from "phaser";
import { Battle, MAP_HEIGHT, MAP_WIDTH, key, type Unit } from "../engine/battle.ts";

const SIZE = 70;
const OX = 30;
const OY = 54;
const FONT = 'system-ui, "Noto Sans SC", "Microsoft YaHei"';
const TERRAIN: Record<string, number> = {
  ".": 0x243a40,
  F: 0x34534b,
  H: 0x625644,
  "#": 0x1a2530,
};
const LABEL: Record<string, string> = { ".": "", F: "林", H: "丘", "#": "峭壁" };
const ROLE: Record<string, string> = {
  sword: "剑", lancer: "枪", archer: "弓",
  mage: "术", raider: "兵", commander: "将",
};

export class TacticsScene extends Phaser.Scene {
  private readonly battle: Battle;
  private drawn: Phaser.GameObjects.GameObject[] = [];
  private ready = false;

  constructor(battle: Battle) {
    super({ key: "TacticsScene" });
    this.battle = battle;
  }
  create(): void {
    this.ready = true;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.battle.result !== "playing") return;
      const x = Math.floor((pointer.x - OX) / SIZE);
      const y = Math.floor((pointer.y - OY) / SIZE);
      this.battle.click(x, y);
    });
    this.refresh();
  }
  refresh(): void {
    if (!this.ready) return;
    for (const object of this.drawn) object.destroy();
    this.drawn = [];
    const g = this.add.graphics();
    this.drawn.push(g);
    this.addLabel(30, 12, "THE RED BANNER · BORDER OUTPOST", 13, "#bbad8f");
    const sel = this.battle.selected;
    const reachable = sel && !sel.moved && !sel.spent ? this.battle.reachable(sel) : new Map();
    const targets = new Set(sel && !sel.spent ? this.battle.targets(sel).map(key) : []);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const px = OX + x * SIZE, py = OY + y * SIZE;
        const t = this.battle.tile(x, y);
        g.fillStyle(TERRAIN[t] ?? 0x243a40, 1);
        g.fillRect(px, py, SIZE - 2, SIZE - 2);
        if ((x + y) % 2 === 1) {
          g.fillStyle(0x000000, .09);
          g.fillRect(px, py, SIZE - 2, SIZE - 2);
        }
        g.lineStyle(1, 0x66818b, .16);
        g.strokeRect(px, py, SIZE - 2, SIZE - 2);
        if (t !== ".") {
          this.addLabel(px + 7, py + 5, LABEL[t] ?? "", t === "#" ? 13 : 14,
            t === "#" ? "#637481" : "#b8bd95");
        }
        if (reachable.has(key({ x, y })) && !this.battle.occupant(x, y)) {
          g.fillStyle(0x5bb0b7, .27);
          g.fillRect(px + 3, py + 3, SIZE - 8, SIZE - 8);
          g.lineStyle(2, 0x70d5db, .9);
          g.strokeRect(px + 3, py + 3, SIZE - 8, SIZE - 8);
        }
        if (targets.has(key({ x, y }))) {
          g.fillStyle(0xff7756, .35);
          g.fillRect(px + 2, py + 2, SIZE - 6, SIZE - 6);
          g.lineStyle(2, 0xff977b, .9);
          g.strokeRect(px + 3, py + 3, SIZE - 8, SIZE - 8);
        }
      }
    }
    for (const u of this.battle.units) if (u.hp > 0) this.drawUnit(g, u);

    this.addLabel(30, 622, "选择友军 → 移动 / 点击红方攻击 → 待机 / 结束回合", 13, "#a7b5b8");
    this.addLabel(700, 622, "10 × 8", 12, "#b2a17d");
    if (this.battle.result !== "playing") {
      g.fillStyle(0x070d15, .72);
      g.fillRoundedRect(139, 232, 480, 150, 14);
      g.lineStyle(2, 0xd7b982, .8);
      g.strokeRoundedRect(139, 232, 480, 150, 14);
      this.addLabel(380, 263, this.battle.result === "victory" ? "关卡胜利" : "挑战失败",
        34, "#f3d7aa", true);
      this.addLabel(380, 322, "使用右侧「重新开始关卡」再挑战", 16, "#bac3c8", true);
    }
  }
  private drawUnit(g: Phaser.GameObjects.Graphics, u: Unit): void {
    const cx = OX + u.x * SIZE + 34;
    const cy = OY + u.y * SIZE + 35;
    const ally = u.team === "ally";
    const selected = u.id === this.battle.selectedId;
    const color = ally ? 0x4a99b5 : 0xb85c54;
    g.fillStyle(0x000000, .45);
    g.fillEllipse(cx, cy + 18, 45, 15);
    g.fillStyle(u.spent ? 0x596975 : color, 1);
    g.fillCircle(cx, cy - 2, 22);
    g.lineStyle(selected ? 4 : 2, selected ? 0xf2dcac : 0xd6d6ca, 1);
    g.strokeCircle(cx, cy - 2, 22);
    this.addLabel(cx, cy - 18, ROLE[u.role] ?? "兵", 21, "#f8faf8", true);
    if (u.spent) {
      g.fillStyle(0x000000, .26);
      g.fillCircle(cx, cy - 2, 21);
    }
    g.fillStyle(0x07141c, 1);
    g.fillRoundedRect(cx - 24, cy + 22, 48, 7, 2);
    g.fillStyle(ally ? 0x72d3b8 : 0xef957a, 1);
    g.fillRoundedRect(cx - 23, cy + 23, 46 * u.hp / u.maxHp, 5, 2);
    this.addLabel(cx, cy + 31, u.name, 10, "#ffffff", true);
  }
  private addLabel(x: number, y: number, text: string, size: number,
    color: string, center = false): void {
    const label = this.add.text(x, y, text, {
      fontFamily: FONT, fontSize: String(size) + "px", color,
      fontStyle: "600",
    });
    if (center) label.setOrigin(.5, 0);
    this.drawn.push(label);
  }
}
