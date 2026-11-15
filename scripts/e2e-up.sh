#!/usr/bin/env bash
# 시연용 E2E를 한 번에 띄운다. 단계마다 이미 떠 있으면 건너뛰므로 두 번 실행해도 안전하다.
# 순서: Docker(Postgres·MinIO) → GPU 장비 서비스 → 맥 터널 → dev:phone → 렌더 워커 → 에뮬레이터 → 차 앱(:3001) → 기어 P
# GPU 장비는 DGX_HOST(ssh 호스트 이름)로 정한다. 다른 장비는 DGX_HOST=<호스트> DGX_GPU=1 scripts/e2e-up.sh
set -euo pipefail
. "$(dirname "$0")/lib/e2e-common.sh"

MIN_AVAILABLE_GB=15
# Qwen(약 5.9GB) + whisper(약 5.8GB), DGX·4090 실측. GPU를 고른 장비에서만 본다.
MIN_GPU_FREE_MIB=12500

ensure_docker() {
  step "1/7 Docker (Postgres·MinIO)"
  if ! docker info >/dev/null 2>&1; then
    open -a Docker
    local i
    for i in $(seq 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
    docker info >/dev/null 2>&1 || die "Docker가 2분 안에 뜨지 않았습니다. Docker 앱을 직접 여세요."
  fi
  (cd "$ROOT" && docker compose up -d --wait postgres minio) >/dev/null
  ok "postgres, minio"
}

dgx_available_gb() {
  ssh "$DGX_HOST" "free -g | awk 'NR==2 { print \$7 }'"
}

# 서비스가 꺼져 있을 때만 올린다. 도는 서비스 밑에서 파일을 바꾸지 않는다.
# spike는 셸 단계(받아쓰기 뒤 측정, 렌더 단계, render-story)와 배치 엔진의 목소리 측정(voice-embed, torch·speechbrain)을 돌리므로 audio와 gpu extra를 깐다.
# 같은 venv를 SPIKE_PYTHON과 SPIKE_VOICE_PYTHON 둘 다로 쓴다.
sync_dgx_code() {
  ssh "$DGX_HOST" "mkdir -p ~/${DGX_SPIKE_DIR} ~/${DGX_SERVICE_DIR}"
  rsync -a --exclude '__pycache__' --exclude '.venv*' --exclude 'outputs' --exclude 'recordings' \
    "$ROOT/gpu/spike/src" "$ROOT/gpu/spike/data" "$ROOT/gpu/spike/pyproject.toml" "$ROOT/gpu/spike/uv.lock" "$DGX_HOST:${DGX_SPIKE_DIR}/"
  rsync -a --exclude '.venv' --exclude 'outputs' "$ROOT/gpu/compose/voice-clone/" "$DGX_HOST:${DGX_SERVICE_DIR}/"
  ssh "$DGX_HOST" "export PATH=\"\$HOME/.local/bin:\$PATH\"; cd ~/${DGX_SPIKE_DIR} && uv sync --frozen --inexact --extra audio --extra gpu -q && cd ~/${DGX_SERVICE_DIR} && uv sync --locked -q"
  ok "코드와 환경 (${DGX_HOST})"
}

gpu_exports() {
  [ -z "$DGX_GPU" ] || printf 'export CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=%s; ' "$DGX_GPU"
}

# GPU를 고른 장비(4090)는 시스템 메모리가 아니라 그 GPU의 남은 메모리가 기동 여부를 정한다.
check_gpu_free() {
  [ -n "$DGX_GPU" ] || return 0
  local free
  free="$(ssh "$DGX_HOST" "nvidia-smi -i '${DGX_GPU}' --query-gpu=memory.free --format=csv,noheader,nounits" | tr -d ' ')"
  echo "  GPU ${DGX_GPU} 남은 메모리: ${free}MiB"
  [ "$free" -ge "$MIN_GPU_FREE_MIB" ] || die "GPU ${DGX_GPU}의 남은 메모리가 ${MIN_GPU_FREE_MIB}MiB 미만(${free}MiB)이라 멈춥니다."
}

start_dgx_service() {
  local avail
  avail="$(dgx_available_gb)"
  echo "  ${DGX_HOST} 가용 메모리: ${avail}GB, GPU 프로세스:"
  ssh "$DGX_HOST" 'nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader' | sed 's/^/    /'
  [ "$avail" -ge "$MIN_AVAILABLE_GB" ] || die "${DGX_HOST} 가용 메모리가 ${MIN_AVAILABLE_GB}GB 미만(${avail}GB)이라 멈춥니다."
  check_gpu_free
  # cd && nohup … &로 묶으면 서브셸이 ssh 출력을 쥐고 남아 ssh가 끝나지 않는다. cd를 따로 끝낸다.
  sync_dgx_code
  ssh "$DGX_HOST" "cd ~/${DGX_SERVICE_DIR} || exit 1; $(gpu_exports)export PATH=\"\$HOME/.local/bin:\$PATH\"; export SPIKE_PYTHON=\"\$HOME/${DGX_SPIKE_DIR}/.venv/bin/python\"; export SPIKE_VOICE_PYTHON=\"\$HOME/${DGX_SPIKE_DIR}/.venv/bin/python\"; export RENDER_JOBS_DIR=\"\$HOME/${DGX_RENDER_JOBS_DIR}\"; export SERVICE_PORT=\"${DGX_SERVICE_PORT}\"; export RENDER_COMPOSE_URL=\"http://127.0.0.1:${DGX_SERVICE_PORT}/api/workflows/runs\"; nohup uv run --locked model-compose up > ${DGX_SERVICE_LOG} 2>&1 < /dev/null &"
  wait_for_dgx_service
}

# 기동이 실패해도 포트는 닫힌 채라, 로그의 실패 줄을 함께 봐야 5분을 헛기다리지 않는다.
dgx_start_failed() {
  ssh "$DGX_HOST" "grep -qE 'failed to start|Traceback|out of memory' ${DGX_SERVICE_LOG}"
}

wait_for_dgx_service() {
  local i
  for i in $(seq 60); do
    dgx_port_open && return 0
    if dgx_start_failed; then
      ssh "$DGX_HOST" "grep -E 'failed to start|Error' ${DGX_SERVICE_LOG} | tail -3" | sed 's/^/    /'
      die "DGX 전사 서비스 기동 실패. 남은 프로세스는 scripts/e2e-down.sh로 정리하세요."
    fi
    sleep 5
  done
  die "5분 안에 DGX :${DGX_SERVICE_PORT}가 열리지 않았습니다. ssh ${DGX_HOST} 'tail ${DGX_SERVICE_LOG}'"
}

remember_gpu_host() {
  printf '%s %s\n' "$DGX_HOST" "$DGX_GPU" >"$E2E_GPU_STATE"
}

ensure_dgx_service() {
  step "2/8 GPU 장비 voice-clone 서비스 (${DGX_HOST} :${DGX_SERVICE_PORT}${DGX_GPU:+, GPU ${DGX_GPU}})"
  local pids
  pids="$(dgx_service_pids | tr '\n' ' ')"
  if dgx_port_open; then
    [ -n "$pids" ] || die "DGX :${DGX_SERVICE_PORT}를 우리 서비스가 아닌 프로세스가 쓰고 있습니다."
    skip "이미 떠 있음 (PID ${pids}). 코드와 환경은 올리지 않았습니다. 새 코드가 필요하면 e2e-down 뒤 다시 실행하세요."
    remember_gpu_host
    return
  fi
  [ -z "$pids" ] || die "서비스 프로세스(${pids})는 있는데 포트가 닫혀 있습니다. 기동 중이면 잠시 뒤 다시, 아니면 e2e-down.sh."
  start_dgx_service
  remember_gpu_host
  ok "PID $(dgx_service_pids | tr '\n' ' ')"
}

ensure_mac_tunnel() {
  step "3/8 맥 터널 :${MAC_TRANSCRIBE_PORT} → ${DGX_HOST} :${DGX_SERVICE_PORT}"
  if is_listening "$MAC_TRANSCRIBE_PORT"; then skip "이미 열려 있음"; return; fi
  ssh -fN -o ExitOnForwardFailure=yes -L "${MAC_TRANSCRIBE_PORT}:127.0.0.1:${DGX_SERVICE_PORT}" "$DGX_HOST" \
    || die "터널 실패. 'administratively prohibited'면 DGX authorized_keys의 rn1nju-mac 줄을 보세요."
  ok "PID $(listening_pids "$MAC_TRANSCRIBE_PORT" | tr '\n' ' ')"
}

ensure_phone_dev() {
  step "4/8 웹 (cloudflared → Vite :5173 → API :3001)"
  if is_listening 3001 && is_listening 5173 && [ -n "$(tunnel_url)" ]; then skip "이미 떠 있음"; return; fi
  if is_listening 3001 || is_listening 5173; then die ":3001이나 :5173 하나만 떠 있습니다. scripts/e2e-down.sh 후 다시 실행하세요."; fi
  rm -f "$WEB_TUNNEL_LOG"
  (cd "$ROOT" && nohup pnpm --filter @voice-storybook/web dev:phone >"$PHONE_LOG" 2>&1 < /dev/null & echo $! >"$PHONE_PID_FILE")
  local i
  for i in $(seq 60); do curl -fsS -m 2 localhost:3001/healthz >/dev/null 2>&1 && is_listening 5173 && break; sleep 2; done
  curl -fsS -m 2 localhost:3001/healthz >/dev/null 2>&1 || die "API :3001이 뜨지 않았습니다. ${PHONE_LOG}와 ${WEB_API_LOG}를 보세요."
  ok "로그 ${PHONE_LOG}"
}

# 커밋만 보면 커밋 전 변경을 고친 뒤에도 옛 앱이 남는다. 커밋 전 변경과 새 파일까지 넣어 판단한다.
vehicle_build_id() {
  local untracked
  untracked="$(git -C "$ROOT" ls-files --others --exclude-standard -- apps/vehicle | sed "s#^#$ROOT/#" | xargs git -C "$ROOT" hash-object 2>/dev/null || true)"
  printf '%s %s' "$(git -C "$ROOT" rev-parse HEAD)" "$( { git -C "$ROOT" diff HEAD -- apps/vehicle; echo "$untracked"; } | shasum | cut -c1-12)"
}

# API(:3001)가 마이그레이션을 적용한 뒤에 띄운다. 한 인스턴스만 돈다(DB advisory lock).
ensure_render_worker() {
  step "5/8 렌더 워커 (대기열 → ${DGX_HOST} render-story)"
  if worker_running; then skip "이미 떠 있음 (PID $(cat "$RENDER_WORKER_PID_FILE"))"; return; fi
  (cd "$ROOT" && nohup pnpm --filter @voice-storybook/api render:worker >"$RENDER_WORKER_LOG" 2>&1 < /dev/null & echo $! >"$RENDER_WORKER_PID_FILE")
  sleep 10
  worker_running || die "렌더 워커가 바로 멈췄습니다. ${RENDER_WORKER_LOG}를 보세요."
  ok "로그 ${RENDER_WORKER_LOG}"
}

wait_for_boot() {
  "$ADB" wait-for-device
  local i
  for i in $(seq 90); do
    [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && return 0
    sleep 3
  done
  die "에뮬레이터가 4분 30초 안에 부팅을 끝내지 못했습니다. ${EMULATOR_LOG}를 보세요."
}

ensure_emulator() {
  step "6/8 에뮬레이터 (${AVD})"
  if [ -n "$(emulator_serial)" ]; then skip "이미 떠 있음 ($(emulator_serial))"; return; fi
  nohup "$EMULATOR" -avd "$AVD" -no-snapshot-load -no-boot-anim -dns-server 8.8.8.8,1.1.1.1 >"$EMULATOR_LOG" 2>&1 < /dev/null &
  wait_for_boot
  ok "$(emulator_serial)"
}

ensure_vehicle_app() {
  step "7/8 차 앱 debug 설치 (http://10.0.2.2:3001)"
  local build
  build="$(vehicle_build_id)"
  if [ "$(cat "$VEHICLE_MARK" 2>/dev/null || true)" = "$build" ]; then skip "이 코드로 이미 설치함"; return; fi
  if pgrep -f 'org.gradle.wrapper.GradleWrapperMain' >/dev/null; then die "다른 Gradle 빌드가 돌고 있습니다. 끝난 뒤 다시 실행하세요(한 번에 하나)."; fi
  (cd "$VEHICLE_DIR" && ./gradlew -q :app:installDebug -Pvehicle.debugApiBaseUrl=http://10.0.2.2:3001)
  echo "$build" >"$VEHICLE_MARK"
  ok "설치"
}

launch_vehicle_app_in_park() {
  step "8/8 기어 P, 차 앱 열기"
  "$VEHICLE_DIR/scripts/vconsole.sh" gear Park
  "$ADB" shell am start --user current -n "${VEHICLE_PKG}/.ui.MainActivity" >/dev/null
  ok "기어 P"
}

main() {
  uptime
  refuse_if_demo_gpu_service
  ensure_docker
  ensure_dgx_service
  ensure_mac_tunnel
  ensure_phone_dev
  ensure_render_worker
  ensure_emulator
  ensure_vehicle_app
  launch_vehicle_app_in_park
  print_e2e_status
  print_phone_banner
}

main "$@"
