# Wildfield Tactics · ECS 直部署操作说明

## 当前独立发布结构

- GitHub `Tactics-Game/main`：游戏源码和版本。
- GitHub Actions `Publish Tactics static site`：在 GitHub Runner 完成依赖安装、TypeScript 检查、规则测试和生产构建，将产物写入 `site` 分支（每个产物附带源代码 SHA）。
- ECS 的 `tactics-game-deploy.timer`：按服务器当前 timer 配置周期检查 `main` 和 `site`，验证针对对应 `main` SHA 的发布工作流已成功，再下载构建产物。
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

## SSH 443 主用、HTTPS 备用（2026-10-14）

本机实测 GitHub HTTPS 443 多次超时，而 ssh.github.com:443 连续 20 次连通，并已用只读 Deploy Key 成功读取 main/site 两个分支。新的 ECS 部署脚本在专用服务凭据齐备时优先使用 SSH 443 执行 Git ls-remote 和 fetch；SSH 失败才尝试原 HTTPS。没有部署专用凭据时仍按原有 HTTPS 方式执行。

**不要修改 /opt/tactics-game/repo 的 origin**：脚本仍验证 origin 为原 GitHub HTTPS 仓库，但实际 Git 传输会使用单独的 SSH URL。不要重跑 install-ecs.sh 或 resume-ecs.sh，不要重新部署 Nginx 或其他游戏。

部署 service 使用 ProtectHome=true，无法直接读取 /root/.ssh。必须先将已经过认证的 Deploy Key 和 known_hosts 复制到 /etc 路径（不要提交任何密钥）：

~~~bash
install -d -o root -g root -m 0700 /etc/tactics-game/ssh
install -o root -g root -m 0600 /root/.ssh/tactics_game_deploy \
  /etc/tactics-game/ssh/tactics_game_deploy
install -o root -g root -m 0644 /root/.ssh/tactics_known_hosts \
  /etc/tactics-game/ssh/tactics_known_hosts
ssh-keygen -lf /etc/tactics-game/ssh/tactics_known_hosts
~~~

GitHub SSH Ed25519 官方指纹应为 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU，核对不一致则停止。另需检查 /etc/tactics-game/ssh 文件归 root 且私钥权限为 0600。

通过 /etc 中的副本预先测试实际服务使用的身份验证：

~~~bash
GIT_SSH_COMMAND='ssh -i /etc/tactics-game/ssh/tactics_game_deploy -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/tactics-game/ssh/tactics_known_hosts -o ConnectTimeout=8' \
  git -C /opt/tactics-game/repo ls-remote \
  ssh://git@ssh.github.com:443/q894829927/Tactics-Game.git \
  refs/heads/main refs/heads/site
~~~

### 将仓库的新部署脚本安装到运行中的 ECS

服务器已安装并运行的 /opt/tactics-game/bin/deploy.sh **不会因为 main 合并而自动更新**。以下仅更新此脚本；不修改 systemd 的 2 分钟 OnCalendar 自定义配置、Nginx、已有站点目录以及其他游戏服务。

如 /root/Tactics-Game 的 HTTPS git pull 因网络不稳定失败，可直接通过已验证的 root SSH 密钥提取代码，仍无需修改 origin：

~~~bash
cd /root/Tactics-Game
GIT_SSH_COMMAND='ssh -i /root/.ssh/tactics_game_deploy -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/root/.ssh/tactics_known_hosts -o ConnectTimeout=8' \
  git fetch ssh://git@ssh.github.com:443/q894829927/Tactics-Game.git main
git merge --ff-only FETCH_HEAD
bash -n scripts/deploy-ecs.sh

systemctl stop tactics-game-deploy.timer
while systemctl is-active --quiet tactics-game-deploy.service; do sleep 2; done

backup="/opt/tactics-game/bin/deploy.sh.before-ssh-$(date +%Y%m%d-%H%M%S)"
cp -p /opt/tactics-game/bin/deploy.sh "$backup"
install -o root -g root -m 0755 scripts/deploy-ecs.sh /opt/tactics-game/bin/deploy.sh.next
mv -f /opt/tactics-game/bin/deploy.sh.next /opt/tactics-game/bin/deploy.sh
systemctl start tactics-game-deploy.service
journalctl -u tactics-game-deploy.service -n 45 --no-pager
systemctl start tactics-game-deploy.timer
systemctl list-timers --all tactics-game-deploy.timer
cat /var/www/tactics-game/current/.source-sha
~~~

若服务的本轮 GitHub Actions API 请求失败，旧站点应保持不变；检查 journal 而不是重跑安装脚本。恢复备份的旧 HTTPS-only 脚本：

~~~bash
systemctl stop tactics-game-deploy.timer
while systemctl is-active --quiet tactics-game-deploy.service; do sleep 2; done
cp -p /opt/tactics-game/bin/deploy.sh.before-ssh-实际备份时间戳 /opt/tactics-game/bin/deploy.sh
systemctl start tactics-game-deploy.timer
~~~

**尚未解决的依赖：** GitHub Actions 工作流验证依旧请求 api.github.com 的 HTTPS API，不能仅靠 SSH 443 修复。如果 API 也频繁超时，应单独排查并保持发布审批验证，不能为了网络可用而跳过批准检查。两个 Git 传输途径均保留原有 main/site SHA、CI 状态校验、分阶段发布和原子回滚。
