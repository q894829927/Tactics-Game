# Wildfield Tactics（暂定名）

当前英文工作名为 **Wildfield Tactics**，源码仓库标识为 `Tactics-Game`。

独立网页战棋项目，采用 **TypeScript + Vite + 原生 DOM/CSS**。战场采用可缩放、可拖动的地图视口；战斗逻辑独立于渲染层。以《火焰纹章》等经典战棋的回合行动与地形策略为玩法参考，不使用相关官方角色、美术或剧情。

## 开发前必读：版本管理与更新记录

游戏从 **`v0.1.0.0`** 开始使用四段式版本（主版本.特大里程碑.功能.修订），每次完整开发更新都必须**升级版本号并记录具体变更**。下一次小修复使用 `v0.1.0.1`。版本唯一来源为 [`src/version.ts`](src/version.ts)，右下角显示此版本；npm `package.json.version` 保持独立三段格式。

- [更新日志 CHANGELOG.md](CHANGELOG.md)：查看每次更新具体做了什么。
- [版本号规则 docs/VERSIONING.md](docs/VERSIONING.md)：决定升级哪一位，规范提交与 CI。
- [开发代理约束 AGENTS.md](AGENTS.md)：要求每个开发任务同步改版本与日志。
- [七系武器与自由职业系统策划 V1.1](docs/WEAPON-AND-CLASS-SYSTEM.md)：**未来玩法规格，尚未实装**。取消武器三角；剑枪斧弓拳套与黑白魔法均按合法攻速差≥4判定追击，剑的追击伤害额外×1.2；普通物理攻击零耐久、战技消耗耐久；自由转职及独立精通。


## 目标图四阶段落地计划

根据已确定的战场目标 UI，将视觉与交互落地分为：**A 地图美术重建 → B 角色及右侧状态栏 → C 战斗交互反馈 → D 细节打磨与综合验收**。详细计划见 [docs/VISUAL-IMPLEMENTATION-PLAN.md](docs/VISUAL-IMPLEMENTATION-PLAN.md)。A1 的坐标与图层规范已定稿；v0.1.5.0 已移除旧整张 AI 底图，采用独立地表材质、透明树木和透明岩壁组装地图，保留现有战术交互。完整素材库与最终美术验收仍待后续完成，实际范围见 [分层地图说明](docs/MODULAR-MAP-INTEGRATION.md)。

## 地图素材重构：先研究后实施

[火焰纹章地图组织方式与模块化素材计划](docs/MAP-ASSET-PIPELINE.md)：独立地表/树木/岩壁已接入，旧整图和旧小地图纹理已退出运行时。完整微瓦片、自动边角过渡和编辑器仍属于后续计划。

[地表、树木、岩壁风格样张 V1](art/map-style-samples/v1/README.md)：三张原创 PNG 已作为分层地图素材接入，透明树木/岩壁已检查实际 Alpha；原始样张与提示词保留，最终美术评审仍待确认。

[地图素材加载优化](docs/MAP-ASSET-PERFORMANCE.md)：v0.1.5.1 已将运行时资源导出为内容哈希 WebP，三张合计从 9.02 MB 降至 0.90 MB，保留透明通道；共享客户端缓存并异步解码，原始样张保留。

## 第一版范围

- 10×8 格子地图；平地、森林、丘陵和障碍。
- 4 名友军 vs 6 名敌军，完整的玩家/敌军回合。
- 可移动区域、近战/远程攻击与反击、地形防御、战斗记录。
- 战斗失败与胜利条件、重新开始；纯前端运行。
- 全屏暗黑奇幻战斗 HUD：左上角设置、右侧全高单位信息、地图缩放与拖拽、小地图定位、单位上下文指令、回合切换动画。
- 目前行动菜单已接通攻击与待机，道具、术法、交换仍未实现并保持禁用态。
- **本版本为最小玩法原型**：不包含剧情、转职、装备、存档、联网或正式场景/人物素材。

## 部署到 ECS（无需本地测试）

已配置 GitHub Actions 云端构建与独立 ECS 发布脚本：**[查看 ECS 一次性安装说明](docs/DEPLOY-ECS.md)**。游戏将通过 `/games/tactics/` 提供，和游戏大厅、异界共振相互独立。首次在 ECS 上运行 `bash scripts/install-ecs.sh` 后，后续 `main` 分支 CI 通过即可由独立 timer 自动上线。

## 可选：本地运行

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

玩法和技术验收详见 [设计文档](docs/GAME-DESIGN.md)、[UI 参考图规范](docs/UI-REFERENCE.md) 与 [开发计划](docs/ROADMAP.md)。与 `Rift-Resonance` 和 `Game-Portal` 仓库完全独立；GitHub 构建产物自动生成，ECS 初次安装仍待在服务器运行。
