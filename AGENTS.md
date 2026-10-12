# 开发代理工作约束（AGENTS.md）

> 本仓库下所有开发代理（Codex 等）修改代码前必须阅读本文件、`docs/VERSIONING.md` 和 `CHANGELOG.md` 最新记录。当前用户约定默认直接修改 `main`，不擅自创建分支。

## 版本与更新日志：每次开发必做

- **从 `v0.1.0.0` 开始，游戏展示版本采用自定义四段式 `vA.B.C.D`。** 不使用旧三段号作为页面版本，也不在 npm `package.json.version` 直接写四段号。
- 最高级别 A 是正式主版本；第二段 B **仅限特别大的阶段完成并验收**；第三段 C 表示独立功能完成；第四段 D 是修复、UI 小调整、优化、文档、测试、脚本、CI 改动。
- **每次开发更新必须递增版本号，并在 `CHANGELOG.md` 顶部新增对应版本条目，具体说明新增、修改或修复内容。** 没有“用户未要求发布所以不升版本”的例外。
- 以一次完整任务为单位决定版本；**一个提交里同时包含实际改动、`src/version.ts` 和 `CHANGELOG.md`**。如果拆成多个 main 提交，每个提交都必须各自合规，不要留下中间无日志提交。
- 在开始开发和完成提交前，都要检查 `src/version.ts`、`CHANGELOG.md`、`docs/VERSIONING.md`，禁止版本重复或遗漏。
- 每次提交运行 `npm run verify`，CI 自动拒绝没有版本升级/更新日志的提交。游戏版本使用单一来源 `src/version.ts`，由 `src/main.ts` 绑定页面元素 `#game-version`。
- 更新完成时告知用户**新四段版本号、具体变更、提交 SHA、CI 结果、静态发布结果和 ECS 是否已确认**；不得把发布成功等同于服务器已经更新。

## 项目设计与部署约束

- [战斗玩法规范](docs/GAME-DESIGN.md)：避免无意改变移动、攻击、反击和胜负条件。
- [战场 UI 参考规范](docs/UI-REFERENCE.md)：页面无顶栏；右侧状态栏贴顶；操作菜单跟随单位；保留小地图缩放和平移。
- [ECS 部署说明](docs/DEPLOY-ECS.md)：保留 `main → CI → site → ECS` 机制、版本 SHA 验证、失败回滚；不要影响 Game-Portal / 异界共振。
- 禁止将设计稿、占位图或未实现的道具、术法、交换功能宣称为已实现。
- 默认直接修改 `main`，除非用户明确要求其他流程。

完整且优先的版本约束见 [docs/VERSIONING.md](docs/VERSIONING.md)。
