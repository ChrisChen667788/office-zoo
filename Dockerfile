# syntax=docker/dockerfile:1
# v6.166 — OFFICE ZOO 托管镜像:单端口同时提供页面、API 与 Socket.IO。
#
#   docker build -t office-zoo .
#   docker run -p 8080:8080 -v office-zoo-data:/data office-zoo
#
# 默认 DEPLOY_PROFILE=hosted:不持有任何模型 key、不现场生图、模型调用由访客自带 key(BYOK)。
# 部署细节与环境变量见 docs/DEPLOY.md。

# ---- 构建前端 -------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --no-audit --no-fund
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client
RUN npm run build

# ---- 运行时 ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    DEPLOY_PROFILE=hosted \
    PORT=8080 \
    FURBALL_DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
# 只装服务端的运行时依赖(服务端用 tsx 直接跑 TypeScript;前端已在构建阶段编好;
# 不装 playwright,OG 卡片回退静态图)
RUN npm ci --omit=dev --workspace=@furball/server --no-audit --no-fund && npm cache clean --force
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY --from=build /app/packages/client/dist ./packages/client/dist
RUN mkdir -p /data && chown -R node:node /data /app/packages/server/public
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
