#!/usr/bin/env bash
# e2e-up.sh가 띄운 것을 내린다. Docker(Postgres·MinIO)는 다른 작업도 쓰므로 그대로 둔다.
# 순서: 렌더 검사 → 렌더 워커 → 웹(dev:phone·cloudflared·API·Vite) → 에뮬레이터 → 맥 터널 → GPU 장비 서비스 → Gradle 데몬
# 장비에서 동화를 렌더하는 중이면 아무것도 내리지 않고 멈춘다. 그래도 내리려면 FORCE=1 scripts/e2e-down.sh
set -euo pipefail
. "$(dirname "$0")/lib/e2e-common.sh"

DGX_UNREACHABLE=no

kill_tree() {
  local child
  for child in $(pgrep -P "$1" || true); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}

# 서비스를 내리면 도는 렌더(워커의 render-story, 운영자 render-batch)가 함께 실패하고 부모가 다시 요청해야 한다.
# 장비에 닿지 않으면 렌더 여부를 알 수 없다. 장비 서비스는 건드리지 않고 맥 쪽만 내린다.
refuse_while_rendering() {
  step "렌더 중인지 확인 (${DGX_HOST})"
  if ! dgx_reachable; then
    DGX_UNREACHABLE=yes
    echo "  ${DGX_HOST}에 닿지 않아 렌더 여부를 확인하지 못했습니다. 장비 서비스는 두고 맥 쪽만 내립니다."
    return
  fi
  local pids
  pids="$(dgx_render_pids | xargs)"
  if [ -z "$pids" ]; then ok "도는 렌더 없음"; return; fi
  ssh "$DGX_HOST" "ps -o pid=,etime=,args= -p '${pids// /,}' | cut -c1-150" | sed 's/^/    /'
  [ "${FORCE:-}" = 1 ] || die "장비에서 렌더 중입니다(PID ${pids}). 끝난 뒤 내리거나, 버려도 되면 FORCE=1로 다시 실행하세요."
  echo "  FORCE=1이라 렌더를 버리고 내립니다. 워커가 다시 뜨면 그 렌더를 다시 내거나 실패로 정리합니다."
}

# 워커를 먼저 내린다. 남겨 두면 서비스가 내려간 사이 새 대기 행을 잡아 제출을 시도한다.
stop_render_worker() {
  step "렌더 워커"
  if ! worker_running; then skip "떠 있지 않음"; rm -f "$RENDER_WORKER_PID_FILE"; return; fi
  kill_tree "$(cat "$RENDER_WORKER_PID_FILE")"
  rm -f "$RENDER_WORKER_PID_FILE"
  ok "정지"
}

stop_phone_dev() {
  step "웹 (dev:phone, cloudflared, API :3001, Vite :5173)"
  [ ! -f "$PHONE_PID_FILE" ] || kill_tree "$(cat "$PHONE_PID_FILE")"
  rm -f "$PHONE_PID_FILE"
  sleep 1
  local pid
  for pid in $(listening_pids 3001) $(listening_pids 5173); do kill_tree "$pid"; done
  pkill -f 'cloudflared tunnel --no-autoupdate --url http://localhost:5173' || true
  ok ":3001 $(yes_if is_listening 3001), :5173 $(yes_if is_listening 5173) (no여야 함)"
}

stop_emulator() {
  step "에뮬레이터"
  "$VEHICLE_DIR/scripts/vconsole.sh" stop 2>/dev/null || pkill -f 'vconsole-heartbeat-' || true
  local serial
  serial="$(emulator_serial)"
  if [ -z "$serial" ]; then skip "떠 있지 않음"; return; fi
  "$ADB" -s "$serial" emu kill >/dev/null 2>&1 || true
  ok "$serial"
}

stop_mac_tunnel() {
  step "맥 터널 :${MAC_TRANSCRIBE_PORT}"
  local pid
  for pid in $(listening_pids "$MAC_TRANSCRIBE_PORT"); do
    ps -o command= -p "$pid" | grep -q "ssh .*${MAC_TRANSCRIBE_PORT}:127.0.0.1:${DGX_SERVICE_PORT}" \
      || { echo "  ${pid}는 우리 터널이 아니라 두었습니다: $(ps -o command= -p "$pid")"; continue; }
    kill "$pid"
    ok "PID ${pid}"
  done
}

stop_dgx_service() {
  step "GPU 장비 voice-clone 서비스 (${DGX_HOST})"
  if [ "$DGX_UNREACHABLE" = yes ]; then skip "${DGX_HOST}에 닿지 않음. 다시 연결되면 e2e-down을 한 번 더 실행하세요."; return; fi
  local pids
  pids="$(dgx_service_pids | xargs)"
  if [ -z "$pids" ]; then rm -f "$E2E_GPU_STATE"; skip "떠 있지 않음"; return; fi
  echo "  내릴 PID: ${pids}"
  ssh "$DGX_HOST" "ps -o pid=,args= -p '${pids// /,}' | cut -c1-150" | sed 's/^/    /'
  ssh "$DGX_HOST" "kill ${pids} 2>/dev/null; sleep 5; kill -9 ${pids} 2>/dev/null; true"
  local left
  left="$(dgx_service_pids | xargs)"
  [ -z "$left" ] || die "${DGX_HOST}에 남은 서비스 프로세스: ${left}"
  rm -f "$E2E_GPU_STATE"
  ok "부모와 whisper 자식 모두 내림"
}

stop_gradle() {
  step "Gradle 데몬"
  (cd "$VEHICLE_DIR" && ./gradlew --stop -q) || true
  ok "정지"
}

refuse_if_demo_gpu_service
refuse_while_rendering
stop_render_worker
stop_phone_dev
stop_emulator
stop_mac_tunnel
stop_dgx_service
stop_gradle
print_e2e_status
