#!/usr/bin/env bash
# 휴대폰 녹음 시험용. cloudflared 빠른 터널 → Vite(:5173) → 웹 전용 API(:3001).
# 공용 :3000은 PUBLIC_ORIGIN이 localhost라 터널에서 온 multipart를 csrf가 403으로 막고, 차 QR도 localhost를 가리킨다.
# 터널 주소는 실행마다 바뀌므로 :3001을 그 주소로 매번 띄운다. Postgres와 MinIO는 공용을 그대로 쓴다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TUNNEL_LOG=/tmp/vs-web-tunnel.log
API_LOG=/tmp/vs-web-api.log
VITE_LOG=/tmp/vs-web-vite.log

[ -f "$ROOT/.env" ] || { echo "$ROOT/.env가 없습니다. API 설정을 먼저 두세요." >&2; exit 1; }

# 공개 터널을 열기 전에 막힐 것을 먼저 확인한다.
is_listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
for port in 3001 5173; do
  if is_listening "$port"; then echo ":${port}을 이미 쓰고 있습니다. 이전 실행이 남았는지 보세요." >&2; exit 1; fi
done
is_listening 18090 || echo "경고: 전사 서비스(:18090)가 없습니다. 낭독 확인이 checking에 머뭅니다." >&2

# pnpm은 실제 서버(tsx, vite)를 자식으로 띄운다. pnpm만 끄면 :3001과 :5173이 남아 다음 실행이 strictPort로 실패한다.
kill_tree() {
  local child
  for child in $(pgrep -P "$1"); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
PIDS=()
# macOS 기본 bash 3.2는 set -u에서 빈 배열을 펼치면 unbound variable로 멈춘다.
cleanup() {
  local pid
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do kill_tree "$pid"; done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

cloudflared tunnel --no-autoupdate --url http://localhost:5173 >"$TUNNEL_LOG" 2>&1 &
PIDS+=("$!")

read_tunnel_url() { grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true; }
URL=""
for _ in $(seq 30); do URL="$(read_tunnel_url)"; [ -n "$URL" ] && break; sleep 1; done
[ -n "$URL" ] || { echo "터널 주소를 받지 못했습니다. ${TUNNEL_LOG}를 보세요." >&2; exit 1; }

# node --env-file은 이미 있는 환경 변수를 덮어쓰지 않는다. PORT와 PUBLIC_ORIGIN만 여기서 정한다.
PORT=3001 PUBLIC_ORIGIN="$URL" pnpm --dir "$ROOT/apps/api" dev:http >"$API_LOG" 2>&1 &
PIDS+=("$!")
WEB_API_ORIGIN=http://localhost:3001 pnpm --dir "$ROOT/apps/web" dev >"$VITE_LOG" 2>&1 &
PIDS+=("$!")

echo "폰에서 열기: $URL"
echo "OTP 코드:   tail -f $API_LOG | grep 'dev mail'"
echo "차 빌드:    ./gradlew :app:installDebug -Pvehicle.debugApiBaseUrl=http://10.0.2.2:3001"
wait
