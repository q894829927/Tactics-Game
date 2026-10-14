import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const scriptURL=new URL("../scripts/deploy-ecs.sh",import.meta.url);
const source=readFileSync(scriptURL,"utf8");
const service=readFileSync(new URL("../ops/tactics-game-deploy.service",import.meta.url),"utf8");

test("deployed root script is valid bash",()=>{
  // Stdin works with native Bash, Git Bash and WSL without translating Windows paths.
  assert.doesNotThrow(()=>execFileSync("bash",["-n"],{input:source.replace(/\r\n/g,"\n")}));
});

test("Git queries and fetch use SSH 443 first and fallback to verified HTTPS",()=>{
  assert.match(source,/SSH_GITHUB="ssh:\/\/git@ssh\.github\.com:443\/q894829927\/Tactics-Game\.git"/);
  assert.match(source,/GITHUB="https:\/\/github\.com\/q894829927\/Tactics-Game\.git"/);
  assert.match(source,/ssh_enabled=0/);
  assert.match(source,/ssh_enabled=1/);
  assert.match(source,/git_remote_ref\(\)/);
  assert.match(source,/git_fetch_site\(\)/);
  assert.match(source,/main_line="\$\(git_remote_ref main\)"/);
  assert.match(source,/site_line="\$\(git_remote_ref site\)"/);
  assert.match(source,/git_fetch_site \|\| die/);
  assert.match(source,/env GIT_SSH_COMMAND="\$SSH_COMMAND"/);
  assert.match(source,/git -C "\$REPO" ls-remote "\$SSH_GITHUB"/);
  assert.match(source,/git -C "\$REPO" ls-remote "\$GITHUB"/);
  assert.match(source,/git -C "\$REPO" fetch --no-tags --depth 1 "\$SSH_GITHUB" refs\/heads\/site/);
  assert.match(source,/git -C "\$REPO" fetch --no-tags --depth 1 "\$GITHUB" refs\/heads\/site/);
  assert.match(source,/git -C "\$REPO" remote get-url origin/);
});

test("systemd ProtectHome cannot hide the SSH credentials from the deployment service",()=>{
  assert.match(service,/ProtectHome=true/);
  assert.match(source,/SSH_IDENTITY="\/etc\/tactics-game\/ssh\/tactics_game_deploy"/);
  assert.match(source,/SSH_HOSTS="\/etc\/tactics-game\/ssh\/tactics_known_hosts"/);
  assert.match(source,/StrictHostKeyChecking=yes/);
  assert.match(source,/BatchMode=yes/);
  assert.match(source,/IdentitiesOnly=yes/);
  assert.match(source,/! -L "\$SSH_IDENTITY"/);
  assert.match(source,/! -L "\$SSH_HOSTS"/);
  assert.doesNotMatch(source,/SSH_IDENTITY="\/root\/\.ssh/);
});

test("SSH fallback does not remove GitHub Actions approval and SHA safety",()=>{
  assert.match(source,/check-publish\.py/);
  assert.match(source,/GitHub Actions API not reachable/);
  assert.match(source,/Built site source \$source_sha != current main \$main_sha/);
  assert.match(source,/site branch changed during poll/);
  assert.match(source,/Verification failed, restoring previous Tactics symlink/);
  assert.match(source,/GitHub site branch unreachable over SSH and HTTPS/);
});
