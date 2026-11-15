#!/usr/bin/env bash
# 시연 서버용 voice-clone 서비스를 Spark에 올리고 관리한다. 맥의 저장소 루트에서 실행한다.
#   bash deploy/demo/gpu-service.sh check     # 읽기만: 메모리, GPU 프로세스, 포트, 서비스 상태
#   bash deploy/demo/gpu-service.sh sync      # 커밋된 HEAD의 spike·voice-clone을 올리고 환경을 맞춘다(서비스가 멈춰 있을 때만)
#   bash deploy/demo/gpu-service.sh install   # env 파일과 systemd 사용자 서비스를 깐다
#   bash deploy/demo/gpu-service.sh start|stop|status
#   bash deploy/demo/gpu-service.sh verify    # 배치 패치와 워크플로 목록을 본다
# 서비스는 docker0 주소(172.17.0.1)에만 연다. 인증이 없어 ngrok이나 밖으로 열면 안 된다.
set -euo pipefail

DGX_HOST="${DGX_HOST:-tusa}"
HOST_IP=172.17.0.1
PORT=18096
UNIT=voice-storybook-voice-clone
MIN_AVAILABLE_GB=40
SYNC_PATHS=(gpu/spike/src gpu/spike/data gpu/spike/pyproject.toml gpu/spike/uv.lock gpu/compose/voice-clone)
cd "$(git rev-parse --show-toplevel)"

# ssh 비대화 세션에는 XDG_RUNTIME_DIR이 없어 systemctl --user가 버스를 못 찾는다.
# 인자는 %q로 감싸 원격 셸이 그대로 받게 한다.
remote() { ssh "$DGX_HOST" "XDG_RUNTIME_DIR=/run/user/\$(id -u) bash -s -- $(printf '%q ' "$@")"; }

# e2e-up이 nohup으로 띄운 서비스가 같은 폴더·포트를 쓰면, 그 밑에서 파일을 바꾸거나 포트를 다툰다.
require_no_foreign_service() {
  remote "$PORT" "$UNIT" <<'EOF'
set -uo pipefail
port=$1 unit=$2
systemctl --user is-active --quiet "$unit" && exit 0
pids=$(pgrep -u "$(id -un)" -f 'voice-storybook-api/voice-clone/.venv' | xargs)
listener=$(ss -ltnp 2>/dev/null | grep ":$port " || true)
[ -z "$pids$listener" ] && exit 0
echo "systemd 밖에서 voice-clone이 돌고 있다(e2e-up 등). 끝난 뒤 다시 한다." >&2
echo "  프로세스: ${pids:-없음}  포트: ${listener:-비어 있음}" >&2
exit 1
EOF
}

check() {
  remote "$PORT" "$UNIT" <<'EOF'
set -euo pipefail
port=$1 unit=$2
uptime
free -g | awk 'NR==2 { print "가용 메모리 " $7 "GB" }'
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader || true
ss -ltnp 2>/dev/null | grep ":$port " || echo "포트 $port 비어 있음"
systemctl --user is-active "$unit" || true
cat ~/voice-storybook-api/DEPLOYED_COMMIT 2>/dev/null || echo "DEPLOYED_COMMIT 없음"
EOF
}

require_clean_head() {
  [ -z "$(git status --porcelain -- "${SYNC_PATHS[@]}")" ] && return 0
  echo "올릴 경로에 커밋 안 된 변경이 있다." >&2
  exit 1
}

# 도는 서비스 밑에서 파일을 바꾸지 않는다. 지운 파일도 따라가도록 임시 폴더에 푼 뒤 rsync --delete로 맞춘다.
sync_code() {
  require_clean_head
  require_no_foreign_service
  remote "$UNIT" <<'EOF'
set -euo pipefail
if systemctl --user is-active --quiet "$1"; then echo "서비스가 돌고 있다. stop 뒤에 다시 한다." >&2; exit 1; fi
staging=~/voice-storybook-api/.sync
if [ -d "$staging" ]; then rm -r "$staging"; fi
mkdir -p "$staging"
EOF
  git archive --format=tar HEAD "${SYNC_PATHS[@]}" | ssh "$DGX_HOST" 'tar -x -C ~/voice-storybook-api/.sync'
  remote "$(git rev-parse HEAD)" <<'EOF'
set -euo pipefail
base=~/voice-storybook-api
export PATH="$HOME/.local/bin:$PATH"
rsync -a --delete --exclude '.venv*' --exclude outputs --exclude recordings "$base/.sync/gpu/spike/" "$base/spike/"
rsync -a --delete --exclude '.venv' --exclude outputs "$base/.sync/gpu/compose/voice-clone/" "$base/voice-clone/"
rm -r "$base/.sync"
(cd "$base/spike" && uv sync --frozen --inexact --extra audio --extra gpu -q)
(cd "$base/voice-clone" && uv sync --locked -q)
echo "$1" > "$base/DEPLOYED_COMMIT"
echo "올린 커밋 $1"
EOF
}

# 서비스 값은 env 파일(600)에만 둔다. EnvironmentFile은 $HOME을 펼치지 않아 절대 경로로 쓴다.
write_env_file() {
  remote "$HOST_IP" "$PORT" <<'EOF'
set -euo pipefail
host=$1 port=$2
base=$HOME/voice-storybook-api
mkdir -p ~/.config/voice-storybook "$base/render-jobs"
umask 077
cat > ~/.config/voice-storybook/voice-clone.env <<ENV
PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
SERVICE_HOST=$host
SERVICE_PORT=$port
SPIKE_PYTHON=$base/spike/.venv/bin/python
SPIKE_VOICE_PYTHON=$base/spike/.venv/bin/python
RENDER_JOBS_DIR=$base/render-jobs
RENDER_COMPOSE_URL=http://$host:$port/api/workflows/runs
QWEN_IDLE_TIMEOUT=5m
WHISPER_IDLE_TIMEOUT=5m
ENV
echo "env 파일: ~/.config/voice-storybook/voice-clone.env"
EOF
}

install_unit() {
  write_env_file
  scp -q deploy/demo/voice-clone.service "$DGX_HOST:/tmp/$UNIT.service"
  remote "$UNIT" <<'EOF'
set -euo pipefail
unit=$1
mkdir -p ~/.config/systemd/user
mv "/tmp/$unit.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable "$unit" >/dev/null
systemctl --user show "$unit" -p MemoryHigh -p MemoryMax
echo "설치함: ~/.config/systemd/user/$unit.service"
EOF
}

control() {
  remote "$UNIT" "$1" <<'EOF'
set -uo pipefail
if [ "$2" != status ]; then systemctl --user "$2" "$1" || exit 1; fi
systemctl --user --no-pager status "$1" | head -12
EOF
}

# 배치 패치와 필수 워크플로가 없으면 실패로 끝낸다. 패치가 없으면 배치 엔진이 문장마다 하나씩 만들어 느려진다.
verify() {
  remote "$HOST_IP" "$PORT" <<'EOF'
set -euo pipefail
host=$1 port=$2
patched=$(grep -l "_to_pcm_resource" ~/voice-storybook-api/voice-clone/.venv/lib/python*/site-packages/mindor/core/component/services/model/tasks/text_to_speech/custom/qwen_clone.py 2>/dev/null || true)
[ -n "$patched" ] || { echo "배치 패치 없음(_to_pcm_resource)" >&2; exit 1; }
echo "배치 패치 있음"
curl -fsS -m 10 "http://$host:$port/api/workflows" | python3 -c '
import json, sys
required = {"render-story", "render-batch", "check-clip", "render-unit", "render-take", "voice-embed", "transcribe", "transcribe-long"}
ids = sorted(w["workflow_id"] for w in json.load(sys.stdin))
missing = sorted(required - set(ids))
print("워크플로", len(ids), ids)
if missing:
    sys.exit(f"빠진 워크플로: {missing}")
'
EOF
}

case "${1:-}" in
  check) check ;;
  sync) sync_code ;;
  install) install_unit ;;
  start|restart) require_no_foreign_service; control "$1" ;;
  stop) control stop ;;
  status) control status ;;
  verify) verify ;;
  *) echo "사용법: $0 check|sync|install|start|stop|restart|status|verify" >&2; exit 2 ;;
esac
