# OFFICE ZOO 托管部署

> v6.166 起仓库自带 `Dockerfile`:一个容器、一个端口,同时提供页面、API 与 Socket.IO。
> 托管形态(`DEPLOY_PROFILE=hosted`)下**服务器不持有任何模型 key**——模型由访客在浏览器里配置自己的 key(BYOK,见下文「模型 key」)。

## 1. 先在本机跑一遍

```bash
docker build -t office-zoo .
```

```bash
docker run --rm -p 8080:8080 -v office-zoo-data:/data office-zoo
```

浏览器打开 `http://localhost:8080`。检查项:

- `http://localhost:8080/api/health` 返回 `"status"`,`llm` 统计字段存在
- 首页左下角有「AI 生成内容 · 仅供娱乐」声明
- 进入任意对局页,浏览器开发者工具里 WebSocket 连接到同一个地址(不是 `localhost:3101`)

## 2. 环境变量

| 变量 | 默认(镜像内) | 说明 |
|------|------|------|
| `DEPLOY_PROFILE` | `hosted` | `hosted`:同源 + 白名单跨域、信任一层反向代理、不现场生图、单端口、托管前端;`local`:本机开发行为 |
| `PORT` | `8080` | 容器监听端口(平台会注入时以平台为准) |
| `FURBALL_DATA_DIR` | `/data` | 对局回放、关系网、统计等 JSON 数据目录。**一定要挂持久卷**,否则重新部署即清空 |
| `TRUST_PROXY_HOPS` | hosted 为 `1` | 前面有几层可信反向代理,用于取真实客户端 IP 做限流。平台自带一层负载均衡时保持 `1`;外面再套一层 CDN 就设 `2`。写多了会让客户端能伪造 IP 绕过限流 |
| `ALLOWED_ORIGINS` | 空 | 额外允许跨域调用 API 的前端来源(逗号分隔完整 origin)。前端与 API 同域时**不用设** |
| `MEMORY_ADMIN_TOKEN` | 空 | 批量清空 AI 记忆的管理口令(≥16 位随机串);不设则批量清空一律拒绝,不影响用户删除自己的记忆 |
| `UMAMI_SCRIPT_URL` / `UMAMI_WEBSITE_ID` | 空 | 访问统计(可选,自部署 Umami)。两个都配好才会在页面加载统计脚本 |
| `TTS_RATE_LIMIT_PER_HOUR` | `120` | `/api/tts/generate` 每 IP 每小时上限 |
| `SINGLE_PORT` | hosted 为 `1` | 强制单 / 双端口(一般不用动) |
| `SERVE_CLIENT_DIR` | 镜像内为前端构建目录 | 由服务器托管的前端产物目录 |

**不要**在托管环境里设置 `OPENAI_API_KEY` / `QINGYUN_API_KEY` / `MINIMAX_API_KEY` 等模型 key:产品不提供模型 API(owner 决策),hosted 形态下即使设置了也不会被使用。

## 3. 选一个平台

不注册企业主体就做不了 ICP 备案,国内云的公网站点上不了线,所以优先境外平台(国内访问会慢一些)。三种写法任选其一;**平台账号、域名、付款都需要你本人操作**。

### Railway

1. New Project → Deploy from GitHub repo → 选本仓库(会自动识别 `Dockerfile`)
2. 服务的 Settings → Volumes → Add Volume,挂载路径 `/data`
3. Variables:不需要额外变量即可启动;按需加 `MEMORY_ADMIN_TOKEN`、`UMAMI_*`
4. Settings → Networking → Generate Domain(Railway 会注入 `PORT`,镜像按它监听)

### Fly.io

```bash
fly launch --no-deploy
```

```bash
fly volumes create office_zoo_data --size 1
```

在生成的 `fly.toml` 里确认:

```toml
[http_service]
  internal_port = 8080
  force_https = true

[mounts]
  source = "office_zoo_data"
  destination = "/data"
```

```bash
fly deploy
```

### 自有服务器 + Caddy

```bash
docker run -d --name office-zoo --restart unless-stopped -p 127.0.0.1:8080:8080 -v /srv/office-zoo:/data office-zoo
```

`/etc/caddy/Caddyfile`(Caddy 自动申请 HTTPS 证书,WebSocket 无需额外配置):

```
zoo.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

## 4. 上线前核对

- [ ] `/api/health` 正常;重启容器后 `/data` 里的数据还在
- [ ] 页面、图片、对局 WebSocket 都走同一个域名,浏览器控制台没有 CORS / WebSocket 报错
- [ ] 每个页面有 AI 生成声明,裁了么对话有「不构成法律意见」
- [ ] 未配置模型 key 时,需要模型的入口提示「先配置模型」,示例对局可直接观看
- [ ] 生成式 AI 服务备案问题已咨询过法律顾问(见 `docs/PRODUCT_REVIEW_2026-10.md` §9.5)

## 5. 本地开发不受影响

`npm run dev` 仍是 3100(API)+ 3101(Socket.IO)+ 5173(vite)三端口,读本机 `.env`;托管相关行为只在 `DEPLOY_PROFILE=hosted` 时生效。
