# e2e-up / e2e-render / e2e-down / e2e-status가 함께 쓰는 상수와 판단. source해서 쓴다.
# macOS bash 3.2: 한글 조사 앞의 변수는 항상 ${var}로 감싼다.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# e2e-up이 고른 GPU 장비를 down·status·render가 이어받는다. 환경변수로 주면 그것이 먼저다.
E2E_GPU_STATE=/tmp/vs-e2e-gpu-host
if [ -z "${DGX_HOST:-}" ] && [ -f "$E2E_GPU_STATE" ]; then read -r DGX_HOST DGX_GPU <"$E2E_GPU_STATE" || true; fi
DGX_HOST="${DGX_HOST:-tusa}"
DGX_SERVICE_DIR="voice-storybook-api/voice-clone"
# 렌더 코드와 환경. 서비스의 render-unit 단계도 이 환경의 파이썬으로 돈다(SPIKE_PYTHON).
DGX_SPIKE_DIR="voice-storybook-api/spike"
DGX_SERVICE_PORT=18096
# render-story가 묶음을 풀고 결과를 남기는 곳. 부모 음성이 들어 있어 잡마다 render-cleanup으로 지운다.
DGX_RENDER_JOBS_DIR="voice-storybook-api/render-jobs"
DGX_SERVICE_LOG="~/voice-storybook-api/voice-clone.log"
# GPU가 여럿인 장비(4090)에서 쓸 GPU 번호. 비우면 장비 기본값이다. 예: DGX_HOST=<호스트> DGX_GPU=1
DGX_GPU="${DGX_GPU:-}"
MAC_TRANSCRIBE_PORT=18090
AVD="${AVD:-Pleos_Connect_v2.1.0_2}"
VEHICLE_DIR="$ROOT/apps/vehicle"
VEHICLE_PKG="com.voicestorybook.vehicle"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
EMULATOR="${EMULATOR:-$HOME/Library/Android/sdk/emulator/emulator}"
export JAVA_HOME="${E2E_JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"

RENDER_WORKER_LOG=/tmp/vs-render-worker.log
RENDER_WORKER_PID_FILE=/tmp/vs-render-worker.pid
PHONE_LOG=/tmp/vs-e2e-phone.log
PHONE_PID_FILE=/tmp/vs-e2e-phone.pid
EMULATOR_LOG=/tmp/vs-e2e-emulator.log
VEHICLE_MARK=/tmp/vs-e2e-vehicle.installed
WEB_TUNNEL_LOG=/tmp/vs-web-tunnel.log
WEB_API_LOG=/tmp/vs-web-api.log

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
skip() { printf '  건너뜀: %s\n' "$*"; }
ok() { printf '  완료: %s\n' "$*"; }
die() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

is_listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
listening_pids() { lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }

# 입력: "pid ppid args" 줄(ps -o pid=,ppid=,args=). 출력: 전사 서비스의 PID(부모와 whisper 자식).
# 명령줄이 서비스 폴더의 .venv를 가리키는 것만 고른다. 셸·ssh·grep처럼 경로를 인자로만 가진 줄은 뺀다.
pick_service_pids() {
  awk -v dir="$DGX_SERVICE_DIR/.venv/" '
    { cmd = $3 }
    cmd ~ /(^|\/)(bash|sh|zsh|ssh|grep|awk|ps)$/ { next }
    index($0, dir) > 0 { print $1 }
  '
}

dgx_service_pids() {
  ssh "$DGX_HOST" 'ps -u "$(id -un)" -o pid=,ppid=,args=' | pick_service_pids
}

# 서비스의 render-unit을 부르며 동화를 렌더하는 프로세스(워커의 render-story, 운영자 render-batch). 서비스를 내리면 함께 실패한다.
dgx_render_pids() {
  ssh "$DGX_HOST" 'ps -u "$(id -un)" -o pid=,args=' | awk '$2 !~ /(^|\/)(bash|sh|zsh|ssh)$/ && /spike\.run_render_(job|story)/ { print $1 }'
}

worker_running() {
  [ -f "$RENDER_WORKER_PID_FILE" ] && kill -0 "$(cat "$RENDER_WORKER_PID_FILE")" 2>/dev/null
}

# 시연 서버용 voice-clone 서비스(deploy/demo/gpu-service.sh)가 같은 폴더·포트를 systemd로 쓴다.
# 그 서비스가 돌면 e2e는 장비 쪽을 띄우지도 내리지도 않는다. 내리면 시연 렌더가 죽고 systemd가 다시 띄운다.
DEMO_GPU_UNIT=voice-storybook-voice-clone
refuse_if_demo_gpu_service() {
  ssh "$DGX_HOST" "XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user is-active --quiet ${DEMO_GPU_UNIT}" 2>/dev/null || return 0
  die "${DGX_HOST}에서 시연 서버용 ${DEMO_GPU_UNIT}가 돌고 있습니다. e2e는 그 서비스와 폴더·포트가 같아 멈춥니다(deploy/demo/README.md \"GPU 서비스\")."
}

dgx_reachable() {
  ssh -o ConnectTimeout=8 -o BatchMode=yes "$DGX_HOST" true >/dev/null 2>&1
}

dgx_port_open() {
  ssh "$DGX_HOST" "ss -ltn | grep -q ':${DGX_SERVICE_PORT} '"
}

tunnel_url() {
  grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$WEB_TUNNEL_LOG" 2>/dev/null | head -1 || true
}

emulator_serial() {
  "$ADB" devices 2>/dev/null | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }'
}

print_status_line() {
  if [ "$2" = yes ]; then printf '  \033[32m켜짐\033[0m  %s  %s\n' "$1" "${3:-}"; return; fi
  printf '  \033[31m꺼짐\033[0m  %s  %s\n' "$1" "${3:-}"
}

yes_if() { if "$@" >/dev/null 2>&1; then echo yes; else echo no; fi; }

print_e2e_status() {
  step "상태"
  print_status_line "Postgres·MinIO" "$(yes_if is_listening 5432)" ":5432 :9000"
  print_status_line "맥 전사 터널" "$(yes_if is_listening "$MAC_TRANSCRIBE_PORT")" ":${MAC_TRANSCRIBE_PORT} → ${DGX_HOST} :${DGX_SERVICE_PORT}"
  print_status_line "웹 API" "$(yes_if curl -fsS -m 3 localhost:3001/healthz)" ":3001"
  print_status_line "Vite" "$(yes_if is_listening 5173)" ":5173"
  print_status_line "렌더 워커" "$(yes_if worker_running)" "${RENDER_WORKER_LOG}"
  print_status_line "에뮬레이터" "$( [ -n "$(emulator_serial)" ] && echo yes || echo no)" "$(emulator_serial)"
}

print_phone_banner() {
  local url
  url="$(tunnel_url)"
  [ -n "$url" ] || { echo "  터널 주소 없음. ${WEB_TUNNEL_LOG}를 보세요."; return; }
  printf '\n\033[1;33m================================================================\033[0m\n'
  printf '\033[1m  폰에서 열기:  %s\033[0m\n' "$url"
  printf '  OTP 코드:     grep "dev mail" %s | tail -1\n' "$WEB_API_LOG"
  printf '  상태 다시 보기: scripts/e2e-status.sh\n'
  printf '\033[1;33m================================================================\033[0m\n'
}
