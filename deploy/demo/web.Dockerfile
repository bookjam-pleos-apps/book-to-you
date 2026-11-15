# 시연 서버의 앞단 이미지. 부모 웹 빌드를 서빙하고 /v1은 api로 넘긴다.
# 웹과 API가 한 출처(ngrok 도메인)에 있어야 세션 쿠키와 csrf Origin 검사가 맞는다.
# 빌드 컨텍스트는 저장소 루트다: docker build -f deploy/demo/web.Dockerfile .
FROM node:24.1.0-slim@sha256:5ae787590295f944e7dc200bf54861bac09bf21b5fdb4c9b97aee7781b6d95a2 AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@voice-storybook/web..."

COPY packages/shared/src packages/shared/src
COPY apps/web apps/web
RUN pnpm --filter @voice-storybook/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6

COPY deploy/demo/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/demo/web-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
