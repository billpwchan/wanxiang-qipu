# 部署

网站是纯静态文件，部署在一台已有其他服务的 Linux 服务器上。原则是**只动自己的东西**：新增一个容器、一个网关片段、一个目录，不改其他服务的任何配置。

- 地址：https://wanxiang.52-198-144-26.sslip.io/
- 服务器：`<server-ip>`，SSH 用户 `<ssh-user>`（具体值不写进仓库）
- 当前发布：20260926-151739（`site/dist/release.json`）
- 目录：`/opt/wanxiang/releases/<发布号>`，`/opt/wanxiang/current` 是指向当前版本的软链接
- 容器：`wanxiang-guide`，用服务器上已有的 `caddy:2.10-alpine` 镜像，配置见 `deploy/Caddyfile`
- 网关：只新增 `/config/sites-enabled/wanxiang.caddy`（`deploy/wanxiang.caddy`），其余片段不动
- 域名用 sslip.io 按 IP 解析；HTTPS 证书由现有网关自动管理

## 更新（常规流程）

```sh
node scripts/verify-site.mjs && node scripts/verify-ui.mjs      # 先在本地全部通过
python3 scripts/make_release.py                                  # 写 release.json，打包到 releases/wanxiang-static-<R>.tar.gz
R=<上一步打印的 release>
scp releases/wanxiang-static-$R.tar.gz <ssh-user>@<server-ip>:/tmp/   # 注意主机后面的冒号，漏了会在本地生成一个叫 <ssh-user>@… 的文件
ssh <ssh-user>@<server-ip> "sudo python3 - $R /tmp/wanxiang-static-$R.tar.gz" < deploy/update.py
node scripts/verify-ui.mjs https://wanxiang.52-198-144-26.sslip.io/  # 公网验收
```

`deploy/update.py` 在服务器上做的事：

1. 记录所有容器的 ID、状态、启动时间、重启次数，以及网关全部片段的 SHA-256（审计目录 `/opt/wanxiang/deploy/update-<R>/`）；
2. 解压到新的 `releases/<R>`（拒绝覆盖已有版本、拒绝压缩包里的软链接和越界路径）；
3. 按 `release.json` 逐个核对 SHA-256；
4. 在同目录建临时软链接，再用 `os.replace` 原子替换 `current`；
5. 通过网关请求 `/healthz` 和 `release.json`，确认新版本在服务；再核对容器和网关片段前后完全一致；
6. 任何一步失败，原子切回上一个版本。

不重启容器，不重载网关。

## 回退

旧版本目录都保留着，把 `current` 原子指回去即可：

```sh
ssh <ssh-user>@<server-ip> 'cd /opt/wanxiang && sudo ln -s releases/<旧发布号> next && sudo mv -T next current'
```

撤下整个网站：只移走本项目的 `wanxiang.caddy` 片段，验证并平滑重载网关，再停止 `wanxiang-guide`。保留目录与发布版本即可恢复。不要覆盖网关总配置、清理其他片段或停止其他容器。

## 已知问题

- `deploy/Caddyfile` 的长期缓存规则写的是旧路径 `/assets/cards/*`。v5 的卡图在 `/assets/c/`（文件名是来源 URL 的摘要，可以长期缓存），目前和其他文件一样走 `no-cache` 重新验证：功能正确，只是没用上长缓存。改这条规则需要重启 `wanxiang-guide`（容器里 Caddy 的 admin 接口是关的）。

## 隔离

静态网站没有数据库、账号、后台 API 或模型密钥。容器以非 root 用户运行，根文件系统与站点目录只读；内存上限 96 MiB、CPU 0.25 核、进程上限 64，日志轮转。仅保留镜像执行所需的 NET_BIND_SERVICE capability；其他 capabilities 均移除。使用内部网络 `jchart_gateway`，没有新增主机端口，没有更改防火墙或其他应用。

HTML、JS、CSS 与数据使用 no-cache，后续更新会重新验证。全部请求素材来自同源，不依赖外部字体或图片 CDN。卡牌原始来源链接仅用于用户主动打开查证。

## 首次安装

`deploy/install.sh` 是首次安装脚本，存在同名容器、入口链接或网关片段时会拒绝覆盖。不要把首次安装脚本直接用作更新脚本。

服务器 `/opt/wanxiang/deploy/` 保存部署前后的其他容器名称、启动时间、重启次数与配置摘要。`deploy/verify_remote.py` 通过标准输入在服务器运行，可核对发布文件与其他服务的基线。

首次启动因镜像文件 capability 与 capability bounding set 不匹配被系统拒绝；上线前健康检查阻止了网关变更。仅重建新站点容器、保留必需 capability 后成功，未重启其他容器。

SSH 私钥仅在本机 SSH 客户端使用，未复制到服务器或网站目录。

## 发布记录

### 2026-09-23 深度研究版更新

- 发布 `20260923-074906`；前一版 `20260923-052344` 保留。
- 使用 `deploy/update.py` 核验 742 个文件后原子切换 `current`，无容器重启、无网关重载。
- 更新前后全部容器 ID、状态、启动时间、重启次数完全一致，全部网关片段摘要一致。
- 审计记录：`/opt/wanxiang/deploy/update-20260923-074906/`。
- 公网 HTTPS 首页、脚本、研究数据、原文与十个入口的头像/立绘逐字节匹配本地。

### 2026-09-23 本地推演版更新

- 发布 `20260923-132939`，前版 `20260923-074906` 保留。
- 核验 746 个静态文件后原子切换；所有容器 ID、状态、启动时间、重启次数与网关片段摘要不变。
- 无新增模型服务、API 密钥或后台进程；推演在浏览器 Web Worker 中执行。
- HTTPS 首页、四个推演文件、应用入口与数据共 10 个文件逐字节匹配；健康检查成功。
- 公网手机实测方案计算、第一步执行、撤销、研究入口与返回；无公网脚本错误、无损坏图片或外部图片请求。
- 审计：`/opt/wanxiang/deploy/update-20260923-132939/`。
- 后续发布增加运行 `node scripts/verify-planner.mjs`。

### 2026-09-26 v4「战术海报」+ 检索器验证版

- 发布 `20260926-025644`；前一版 `20260923-132939` 保留，可原子切回。
- 流程：`scripts/make_release.py` → scp 到 `/tmp` 并核对 SHA-256 → `sudo python3 - <release> <archive> < deploy/update.py`。
- 结果：1373 个文件摘要核验通过；`/healthz` ok；全部容器 ID/状态/启动时间/重启次数与网关片段摘要前后一致；没有重启容器、没有重载网关，未触碰服务器上的其他项目。
- 公网验收：`release.json`、首页、脚本、样式、证据数据、字体、GSAP、分享图逐字节匹配本地；`node scripts/verify-ui.mjs https://wanxiang.52-198-144-26.sslip.io/` 33/33 通过（生产 CSP 下无脚本错误）。

### 2026-09-26 文案清理 + 高清分层海报版

- 发布 `20260926-125503`；前一版 `20260926-025644` 保留，可原子切回。
- 1446 个文件摘要核验通过；`/healthz` ok；全部容器与网关片段摘要前后一致；未重启容器、未重载网关，未触碰其他项目。
- 公网验收：关键文件逐字节匹配；`verify-ui.mjs` 37/37；`verify-motion.mjs`（动效模式：视图过渡、平滑滚动、形变）无脚本错误。

### 2026-09-26 v5「冰晶」重构

- 发布 `20260926-145954`（全新前端：开局→对局副屏→路线页，官方棋手立绘 + 卡面原画，竖纹玻璃 WebGL），随后 `20260926-151739`（路线结论按机制推演 + 棋手全部对局口径重排，新增「体检」）。前一版 `20260926-125503` 保留，可原子切回。
- 769 个文件摘要核验通过；`/healthz` ok；全部容器与网关片段摘要前后一致；未重启容器、未重载网关，未触碰其他项目。
- 公网验收：关键文件逐字节匹配；`node scripts/verify-ui.mjs https://wanxiang.52-198-144-26.sslip.io/` 50/50（开 WebGL：`GPU=1`）。
- 发布包从约 60MB 降到 17MB：旧抠图、PNG 卡图、GSAP/Lenis 移到 `research/v4/retired/`，不再上线。
