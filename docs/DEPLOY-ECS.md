# Wildfield Tactics · ECS 直部署操作说明

## 当前独立发布结构

- GitHub `Tactics-Game/main`：游戏源码和版本。
- GitHub Actions `Publish Tactics static site`：在 GitHub Runner 完成依赖安装、TypeScript 检查、规则测试和生产构建，将产物写入 `site` 分支（每个产物附带源代码 SHA）。
- ECS 的 `tactics-game-deploy.timer`：每约 5 分钟检查 `main` 和 `site`，验证针对对应 `main` SHA 的发布工作流已成功，再下载构建产物。
- ECS 网站路径 `/games/tactics/`：Nginx 只托管静态游戏文件，无需新增 Node 服务。
- `Game-Portal` 在 `/`，原 `Rift-Resonance` 在 `/games/rift/`；这些服务与定时器不改动。

**不要求本地构建或本地测试。** 一次性安装仍需在拥有 SSH 终端的 ECS 上执行。当前 ChatGPT 的 GitHub 连接可以提交代码/确认 GitHub CI，但不能直接 SSH 到 ECS，故无法替用户在 ECS 执行以下命令。

## 已遇到：Nginx 规则存在，但 systemd 没装完（2026-10-13）

实际 ECS 观测到：

- `/etc/nginx/conf.d/rift.conf` 已引用 `/etc/nginx/snippets/tactics-game-routes.conf`，`nginx -t` 成功，`/games/tactics/` 返回 HTTP 200。
- `/var/www/tactics-game/current` 是**真实目录（非软链接）**，`releases` 存在，`/opt/tactics-game/repo` 已存在。
- `tactics-game-deploy.timer` 与 `tactics-game-deploy.service` 均不存在。
- 再执行 `install-ecs.sh` 会安全停止：`Tactics Nginx snippet exists; do not install twice`。

**这是部分安装状态，不应删除 Nginx 配置或原有游戏文件。** 为此增加了专用续装脚本 `scripts/resume-ecs.sh`，严格检测上述状态后操作。该脚本先验证三个站点、GitHub 正式 `main` 源码对应的构建 CI 成功，然后把当前真实游戏目录移到带时间戳的 `releases/legacy-before-recovery-...` 中保存，再建立 `current` 软链接，发布云端构建版本并通过原有 HTTP 内容校验，最后安装独立 timer。若失败则尝试恢复原真实目录和停止新服务。**不会编辑或重载 Nginx。**

```bash
cd /root/Tactics-Game
git pull --ff-only origin main
bash -n scripts/resume-ecs.sh
bash scripts/resume-ecs.sh
systemctl list-timers --all | grep -E 'tactics-game-deploy|game-portal-deploy|rift-deploy'
journalctl -u tactics-game-deploy.service -n 80 --no-pager
readlink -f /var/www/tactics-game/current
```

> `resume-ecs.sh` 仅适用于上述精确状态。若出现新的目录状态或组件已安装，脚本会主动拒绝，而不是强制覆盖；请把输出用于排查。首次安装成功后不用再次运行任何安装脚本。

## 一次性安装：在 ECS 上运行

确认你已在阿里云 ECS 的 root Shell 中：

```bash
cd /root
git clone https://github.com/q894829927/Tactics-Game.git
cd /root/Tactics-Game
git pull --ff-only origin main

# 此命令会检查原网站、先下载 GitHub 已构建的静态产物，
# 然后备份 Nginx 配置，新增 /games/tactics/ 路由，
# 执行 HTTP 验收，通过后安装独立自动部署 timer。
bash scripts/install-ecs.sh
```

如已经克隆仓库，则跳过 `git clone`。如果 GitHub `site` 分支尚未出现，等待 `Publish Tactics static site` 工作流完成再执行。请**不要**重装 Nginx、不要再次执行 `Game-Portal/scripts/migrate-ecs.sh apply`，也不要修改 `Rift-Resonance` 的自动部署任务。

安装成功后应能访问：

- 游戏大厅：`http://47.119.122.133/`
- 《异界共振》：`http://47.119.122.133/games/rift/`
- 新战棋：`http://47.119.122.133/games/tactics/`

确认新战棋可访问后再修改 `Game-Portal` 的“开发中”游戏卡片，指向新地址。

## 验收与排障

```bash
systemctl list-timers --all | grep -E 'tactics-game-deploy|game-portal-deploy|rift-deploy'
journalctl -u tactics-game-deploy.service -n 80 --no-pager
readlink -f /var/www/tactics-game/current

curl -fsS -I -H 'Host: 47.119.122.133' http://127.0.0.1/games/tactics/
curl -fsS -H 'Host: 47.119.122.133' http://127.0.0.1/health
```

初次安装脚本会备份当前 `/etc/nginx/conf.d/rift.conf` 至 `/var/backups/tactics-game-install/<UTC日期>/rift.conf`。配置校验失败或静态页面检查失败则自动尝试回滚。现有 Portal 和 Rift 的软链接及 systemd 服务不改动。

## 后续发布

将战棋代码 push 到 `main` 即可。GitHub Actions 在云端编译出 `site` 分支，ECS 定时器只部署已通过对应发布工作流的 `main` SHA。如果新版本 CI 失败、GitHub 暂时断连或新产物尚未就绪，则继续保留旧站点。发布后的 HTML 和构建 JS 按字节校验；异常时恢复旧软链接，不重载 Nginx。

**部署脚本本身的更新需要人工审查再重新安装。** 自动发布只读取 `site` 分支的纯静态资源，不从 GitHub 自动获取并执行新的 root Shell 脚本。

## 关闭自动更新 / 回滚

```bash
systemctl stop tactics-game-deploy.timer
ls -lt /var/www/tactics-game/releases
readlink -f /var/www/tactics-game/current
```

选择上一个经过确认的发布目录后，可原子切换软链接：

```bash
ln -s /var/www/tactics-game/releases/确认的旧版本SHA /var/www/tactics-game/.manual-rollback
mv -Tf /var/www/tactics-game/.manual-rollback /var/www/tactics-game/current
```

如果需要撤销新 Nginx 路由，先停止 `tactics-game-deploy.timer`，然后使用安装日志记录的备份配置恢复 `/etc/nginx/conf.d/rift.conf`，删除 `/etc/nginx/snippets/tactics-game-routes.conf`，执行 `nginx -t` 成功后再 reload。不要直接覆盖未知的近期配置修改。

## 范围与限制

这一步部署的是当前 T0/T1 玩法原型：4vs6、10×8 地图、移动、攻击反击、AI 和关卡结算。还没有角色经验成长、完整武器克制、剧情章节或正式美术。GitHub CI 可以证实自动构建/规则测试通过，但仍需在 ECS 部署后直接用浏览器体验和验收玩法。无需本地测试。
