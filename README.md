# FishDesk

登记日常任务，自动汇总生成日报、周报、月报草稿。登记一次，报告复用。

数据现在保存在你自己的服务器上，多设备登录看到同一份数据；访问需要密码，登录后本设备在有效期内保持登录。

## 组成

- `index.html` / `styles.css` / `app.js`：工作台前端（三列看板 + 报告中心）
- `login.html`：密码登录页
- `server.js`：零依赖 Node 服务，负责鉴权、静态托管、数据读写
- `data/daylight.json`：任务数据（Docker 中位于 `/data`）
- `data/session.secret`：登录 Cookie 签名密钥，首次启动自动生成
- `data/auth.json`：访问密码哈希（首次用环境变量初始化，之后可在界面修改）
- `data/config.json`：界面「设置」保存的 AI 配置、界面主题和登录有效期（首次保存时生成）

## 本机运行

需要 Node 18 以上。

PowerShell：

```powershell
$env:PASSWORD="你的访问密码"
$env:PORT="8080"
node server.js
```

bash：

```bash
PASSWORD="你的访问密码" PORT=8080 node server.js
```

打开 http://127.0.0.1:8080 ，输入密码进入。数据默认写入仓库下的 `data/`。

AI 润色的 API Key、接口地址、模型、界面主题、访问密码和登录有效期都在登录后的「设置」里调整，保存后立即生效，不需要改环境变量或重启服务。

## Docker 运行（推荐）

```bash
FISHDESK_PASSWORD="你的访问密码" \
docker compose up -d --build
```

也可以把变量写进项目根目录的 `.env`（不要提交到仓库）：

```dotenv
FISHDESK_PASSWORD=你的访问密码
```

然后 `docker compose up -d --build` 即可。AI 相关配置不再需要写进 `.env`，登录后在「设置」里填写即可。

访问 http://服务器IP:8080 。

数据落在命名卷 `fishdesk-data`（容器内 `/data`）。`docker compose down`、重建容器都不会丢数据；只有显式删除该卷才会清空。

查看数据卷实际位置：

```bash
docker volume inspect fishdesk-data
```

不使用 compose 时：

```bash
docker build -t fishdesk .
docker run -d --name fishdesk -p 8080:8080 \
  -e PASSWORD="你的访问密码" \
  -v fishdesk-data:/data \
  fishdesk
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PASSWORD` | 首次启动 | 访问密码，用于初始化 `data/auth.json`；之后改密码在界面里操作 |
| `PORT` | 否 | 监听端口，默认 `8080` |
| `DATA_DIR` | 否 | 数据目录，默认 `./data`；Docker 镜像内为 `/data` |
| `SESSION_DAYS` | 否 | 登录有效期（天）的初始默认值，默认 `30`；之后可在界面「设置」中修改 |
| `SESSION_SECRET` | 否 | Cookie 签名密钥；不设置则自动生成并保存到 `DATA_DIR/session.secret` |
| `AI_API_KEY` | 否 | 仅在从未在界面保存过密钥时作为默认值；推荐直接在界面「设置」里填写 |
| `AI_BASE_URL` | 否 | 兼容 OpenAI 格式接口地址的初始默认值，默认 `https://api.deepseek.com` |
| `AI_MODEL` | 否 | 模型名的初始默认值，默认 `deepseek-chat` |

`PASSWORD` 只用于首次初始化。之后换密码在登录后的「设置 → 访问密码」里操作，当前设备保持登录，其他设备需要重新登录；想立即让所有设备重新登录，可同时更换 `SESSION_SECRET`（或删除 `data/session.secret`）。

部署在 Nginx / Caddy 反代后面时，请透传 `X-Forwarded-Proto`，服务会据此给 Cookie 加 `Secure`。

公网使用时请务必套一层 HTTPS（Caddy 自动证书最省事）：纯 HTTP 下密码和登录 Cookie 都是明文传输。

## AI 润色（DeepSeek）

报告页和单条工作记录都支持「AI 润色」：只改措辞，事实、数字、日期、项目名保持原样。结果会先展示成一份“润色稿”，你可以核对后替换，也可以随时恢复原文。

### 申请 key

1. 打开 https://platform.deepseek.com/ ，注册并登录。
2. 进入「API keys」，创建一个新的 key（形如 `sk-...`），复制保存好，页面关闭后无法再次查看。
3. 在「充值」里确认账户有余额（调用按量计费）。

### 配置

登录后点顶部「设置」，在「AI 润色」里粘贴 key，按需确认接口地址和模型，点「保存设置」即可立即生效，不需要重启服务。保存前可以先点「测试连接」，页面会直接显示成功或失败原因。

密钥只保存在服务器的 `data/config.json`（`data/` 已在 `.gitignore` 中，不会被提交）；接口只向浏览器返回脱敏后的形态（如 `sk-••••••abcd`），不会下发完整 key。想停用润色，可在设置里点「清除已保存的 API Key」。

默认接口地址是 `https://api.deepseek.com`、模型是 `deepseek-chat`，一般不用改。想换兼容 OpenAI 格式的其他服务，在设置里改这两项即可。

### 界面主题

设置 →「外观」可在「浅色 / 深色 / 跟随系统」之间切换，点选立即生效。选择会写入 `data/config.json` 并同步到所有设备，刷新或换设备登录后保持；「跟随系统」会随操作系统的深浅色设置自动切换。登录页也会使用已保存的主题，提前注入，不会先闪白。

### 怎么用

- 报告：点顶部「工作报告」，选好日报/周报/月报与日期，点右下角「AI 润色」。下方出现润色稿，核对后点「用润色稿替换」；想退回点报告顶部的「恢复原文」。替换后复制、下载 Markdown、打印都会使用润色稿。
- 单条记录：打开任意工作项，在「实际进展 / 结果」里写好内容，点「AI 润色这条记录」。核对后替换，输入框下方会出现「恢复原措辞」，保存工作项后正式生效。

### 验证是否真的接上了

1. 登录后点顶部「设置」，密钥状态显示「已启用」。
2. 点「测试连接」，页面提示「连接成功，模型 deepseek-chat 可正常调用」。
3. 打开日报，有记录时能看到「AI 润色」按钮和一句外部服务提示。
4. 点「AI 润色」，几秒内下方出现润色稿即说明调用成功。

常见提示：`API Key 无效或已被撤销` 说明 key 不对；`账户余额不足` 去 DeepSeek 控制台检查余额；`无法访问接口地址` 检查服务器网络或接口地址。

### 隐私说明

点润色时，报告正文（含项目名、工作记录、后续跟进与风险）会发送到上面配置的外部 AI 服务。密码、登录 Cookie 和原始数据文件不会发送。

## 数据与迁移

- 首次登录时，如果服务器上还没有数据，浏览器里现有的 localStorage 工作项会自动上传到服务器，不会丢。
- 如果服务器已有数据、而这台浏览器存有历史工作项且从未同步过，会把这些历史工作项合并进服务器（按 id 去重，较新的修改优先），只合并一次。
- 之后以服务器数据为准；同一账号在多设备打开时，每 20 秒以及切回标签页时自动拉取更新。
- 两台设备同时修改时按工作项最后修改时间合并，不会互相覆盖整份数据。
- 浏览器里仍保留一份本机缓存，仅用于服务器连不上时显示，不参与同步写入。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/login` | `{"password":"..."}`，成功后下发 HttpOnly Cookie |
| POST | `/api/logout` | 清除登录 Cookie |
| GET | `/api/session` | 当前登录状态 |
| GET | `/api/tasks` | 读取 `{rev, updatedAt, tasks}` |
| PUT | `/api/tasks` | 全量写入 `{baseRev, tasks}`，版本不一致返回 409 |
| POST | `/api/password` | `{"currentPassword":"...","newPassword":"..."}`，修改访问密码 |
| GET | `/api/ai-status` | 返回 `{enabled, model}`，控制润色入口显隐 |
| GET | `/api/settings` | 返回 AI 配置（密钥脱敏）与登录有效期 |
| PUT | `/api/settings` | 保存 AI Key/接口地址/模型/登录有效期/主题（`light`、`dark`、`system`），立即生效 |
| POST | `/api/ai/test` | 测试当前或刚填写的 AI 配置，返回成功/失败原因 |
| POST | `/api/polish` | `{"kind":"report\|log","text":"..."}`，服务端代理调用大模型润色 |
| GET | `/healthz` | 健康检查 |
