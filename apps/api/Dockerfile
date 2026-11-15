# 시연 서버용 API 이미지. 빌드 컨텍스트는 저장소 루트다: docker build -f apps/api/Dockerfile .
# TypeScript를 tsx로 바로 실행한다. 컴파일 단계가 없어 개발 실행과 같은 코드 경로를 탄다.
# 그래서 tsx는 dependencies에 있고, 테스트·타입 도구는 설치하지 않는다.
FROM node:24.1.0-slim@sha256:5ae787590295f944e7dc200bf54861bac09bf21b5fdb4c9b97aee7781b6d95a2

RUN corepack enable
# 녹음 업로드가 ffprobe로 형식을 보고 ffmpeg로 변환한다. 없으면 업로드가 500으로 끝난다.
# 버전은 고정하지 않는다. debian-security는 최신 패치만 남겨 고정하면 다음 업데이트 뒤 빌드가 깨진다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter "@voice-storybook/api..."

COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY content content

WORKDIR /app/apps/api
ENV NODE_ENV=production CONTENT_DIR=/app/content
USER node
EXPOSE 3000
CMD ["./node_modules/.bin/tsx", "src/entrypoints/main-http.ts"]
