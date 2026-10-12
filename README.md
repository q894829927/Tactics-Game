# Tactics-Game · 原创奇幻战棋

独立网页战棋项目，采用 **Phaser + TypeScript + Vite**。以《火焰纹章》等经典战棋的回合行动与地形策略为玩法参考，不使用相关官方角色、美术或剧情。

## 第一版范围

- 10×8 格子地图；平地、森林、丘陵和障碍。
- 4 名友军 vs 6 名敌军，完整的玩家/敌军回合。
- 可移动区域、近战/远程攻击与反击、地形防御、战斗记录。
- 战斗失败与胜利条件、重新开始；纯前端单机。
- **本版本为最小玩法原型**：不包含剧情、转职、装备、存档、联网或正式像素素材。

## 本地运行

要求 Node.js 24 LTS。

```bash
npm install
npm run dev
# 浏览器打开 Vite 输出的地址
```

```bash
npm run check
npm run build
npm test
```

玩法和技术验收详见 [设计文档](docs/GAME-DESIGN.md) 与 [开发计划](docs/ROADMAP.md)。与 `Rift-Resonance` 和 `Game-Portal` 仓库完全独立；尚未部署到 ECS。
