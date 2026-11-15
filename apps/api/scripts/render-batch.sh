#!/usr/bin/env bash
# 대체 렌더. style별로 통과한 클립을 참조로 이야기 한 편을 렌더해 같은 manifest 경로로 게시한다.
#
# 사용: apps/api/scripts/render-batch.sh --voice <id> --story masteraway --host <ssh 호스트> --spike <원격 gpu/spike 절대 경로> [--clip <id>]... [--styles calm] [--gpu 0] [--share-with <pid,...>] [--resume] [--engine qwen3-base-workflow|qwen3-base-batch|qwen3-base] [--compose-url <원격 장비 기준 URL>]
# --clip은 같은 style에 통과 클립이 여럿일 때 style마다 하나씩 준다. --styles calm은 다른 녹음이 있어도 모든 줄을 calm으로 읽는다.
# 그 GPU에 다른 프로세스가 있으면 시작하지 않는다. 공유 장비라 겹치면 결과와 다른 사람의 작업을 함께 망친다.
# --share-with는 운영자가 확인한 프로세스만 PID로 허용한다. 목록에 없는 프로세스가 하나라도 있으면 그대로 거부한다.
# --resume은 앞 실행이 죽어 running으로 남은 렌더를 이어받는다. 돌고 있지 않다는 것을 확인한 뒤에 쓴다.
# 부모 음성이 든 작업 폴더는 성공, 실패와 상관없이 양쪽 장비에서 지운다.
# 기본 엔진(qwen3-base-compose)은 클론과 받아쓰기를 GPU 장비의 voice-clone 서비스에 맡긴다. 서비스도 그 GPU를 쓰므로 공유 확인은 똑같이 한다.
# 이때 --gpu는 서비스가 떠 있는 GPU 번호여야 한다. 공유 확인을 그 GPU에서 한다.
# --engine qwen3-base-workflow는 단위 하나의 흐름(재시도, 받아쓰기, QC)까지 서비스의 render-unit 워크플로우에 맡긴다.
# --engine qwen3-base-batch는 같은 style 단위를 여러 개씩 한 번에 생성한다(render-batch, 배치 크기는 gpu/spike/data/render-engine.json).
# --engine qwen3-base는 렌더 프로세스가 모델을 직접 올리는 비상 경로다. 그 GPU에 서비스가 떠 있으면 먼저 내린다.
set -euo pipefail

VOICE="" STORY="" HOST="" SPIKE="" STYLES="" GPU="0" RESUME="" SHARE_WITH=""
# 엔진 이름은 gpu/spike/src/spike/clone/engine/engine_ids.py와 같다(gpu/spike/tests/entrypoints/test_run_render_job.py가 확인한다).
DIRECT_ENGINE="qwen3-base"
COMPOSE_ENGINE="qwen3-base-compose"
WORKFLOW_ENGINE="qwen3-base-workflow"
BATCH_ENGINE="qwen3-base-batch"
# GPU 장비에 올린 서비스 사본의 포트다(gpu/compose/README.md). 저장소 정의의 18090은 다른 서비스가 쓴다.
ENGINE="$COMPOSE_ENGINE" COMPOSE_URL="http://127.0.0.1:18096/api/workflows/runs"
CLIPS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --resume) RESUME="--resume"; shift; continue ;;
    --voice) VOICE="$2" ;;
    --story) STORY="$2" ;;
    --host) HOST="$2" ;;
    --spike) SPIKE="$2" ;;
    --clip) CLIPS+=(--clip "$2") ;;
    --styles) STYLES="$2" ;;
    --gpu) GPU="$2" ;;
    --share-with) SHARE_WITH="$2" ;;
    --engine) ENGINE="$2" ;;
    --compose-url) COMPOSE_URL="$2" ;;
    *) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
  esac
  shift 2
done
[ -n "$VOICE" ] && [ -n "$STORY" ] && [ -n "$HOST" ] && [ -n "$SPIKE" ] || { echo "--voice --story --host --spike가 필요합니다" >&2; exit 2; }
case "$SPIKE" in /*) ;; *) echo "--spike는 원격의 절대 경로여야 합니다: $SPIKE" >&2; exit 2 ;; esac
case "$ENGINE" in "$DIRECT_ENGINE"|"$COMPOSE_ENGINE"|"$WORKFLOW_ENGINE"|"$BATCH_ENGINE") ;; *) echo "알 수 없는 엔진: $ENGINE" >&2; exit 2 ;; esac

API_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$API_DIR/../.." && pwd)"
LOCAL_ROOT="$(mktemp -d)"
LOCAL_JOB="$LOCAL_ROOT/job"
REMOTE_JOB=""
# 비대화형 ssh는 ~/.local/bin을 PATH에 넣지 않는다. uv 설치 스크립트의 기본 위치다.
REMOTE_UV='PATH="$HOME/.local/bin:$PATH" uv'

remove_remote_job() {
  [ -n "$REMOTE_JOB" ] || return 0
  ssh "$HOST" "cd '$SPIKE' && $REMOTE_UV run --frozen python -m spike.run_render_job --job '$REMOTE_JOB' --cleanup" || \
    echo "경고: GPU 장비의 작업 폴더를 지우지 못했습니다: $REMOTE_JOB" >&2
}
remove_job_folders() {
  remove_remote_job
  rm -rf "$LOCAL_ROOT"
}
trap remove_job_folders EXIT

# 입력: nvidia-smi의 "pid, process_name, used_memory" 줄. 출력: SHARE_WITH에 없는 줄.
unexpected_gpu_apps() {
  awk -F', ' -v allow="$SHARE_WITH" '
    BEGIN { n = split(allow, pids, ","); for (i = 1; i <= n; i++) allowed[pids[i]] = 1 }
    NF > 0 && !($1 in allowed)
  '
}

BUSY="$(ssh "$HOST" "nvidia-smi -i '$GPU' --query-compute-apps=pid,process_name,used_memory --format=csv,noheader")"
UNEXPECTED="$(printf '%s' "$BUSY" | unexpected_gpu_apps)"
if [ -n "$UNEXPECTED" ]; then
  printf 'GPU %s에 다른 프로세스가 있어 시작하지 않습니다:\n%s\n' "$GPU" "$UNEXPECTED" >&2
  if [ "$ENGINE" = "$DIRECT_ENGINE" ]; then
    echo "전사용 voice-clone 서비스가 같은 GPU에 있으면 먼저 내리세요. 렌더가 끝나면 다시 띄웁니다." >&2
  else
    echo "compose 엔진은 voice-clone 서비스를 씁니다. 서비스 PID도 확인한 뒤 --share-with로 허용하세요." >&2
  fi
  exit 3
fi
[ -z "$BUSY" ] || printf '경고: GPU %s를 확인된 프로세스와 함께 씁니다:\n%s\n' "$GPU" "$BUSY" >&2

# 서비스가 떠 있어도 장비의 정의가 낡았으면 렌더 도중에 멈춘다. 엔진이 쓰는 워크플로우가 있는지 시작 전에 확인한다.
required_workflows() {
  case "$ENGINE" in
    "$WORKFLOW_ENGINE") echo "render-unit render-attempt render-take" ;;
    "$BATCH_ENGINE") echo "render-batch voice-embed" ;;
    *) echo "clone-sentence transcribe transcribe-long" ;;
  esac
}

require_compose_service() {
  [ "$ENGINE" != "$DIRECT_ENGINE" ] || return 0
  local workflows needed
  workflows="$(ssh "$HOST" "curl -fsS -m 10 '${COMPOSE_URL%/runs}'")" || { echo "voice-clone 서비스에 닿지 않습니다: $COMPOSE_URL" >&2; exit 3; }
  for needed in $(required_workflows); do
    case "$workflows" in
      *"\"${needed}\""*) ;;
      *) echo "voice-clone 서비스에 ${needed}이 없습니다. 장비의 서비스 정의를 다시 배포하세요(gpu/compose/README.md)." >&2; exit 3 ;;
    esac
  done
}
require_compose_service

cd "$API_DIR"
START_ARGS=(--voice "$VOICE" --story "$STORY" --job-dir "$LOCAL_JOB")
[ ${#CLIPS[@]} -eq 0 ] || START_ARGS+=("${CLIPS[@]}")
[ -z "$STYLES" ] || START_ARGS+=(--styles "$STYLES")
[ -z "$RESUME" ] || START_ARGS+=("$RESUME")
# start가 거부하면 그 이유(JSON)를 보여 주고 끝낸다. set -e가 대입 줄에서 바로 끝내면 이유가 사라진다.
STARTED="$(pnpm --silent render:batch start "${START_ARGS[@]}")" || { echo "$STARTED"; exit 1; }
echo "$STARTED"
RENDER_ID="$(node -e 'console.log(JSON.parse(process.argv[1]).renderId)' "$STARTED")"

rsync -a --exclude '__pycache__' --exclude '.venv*' --exclude 'outputs' --exclude 'recordings' \
  "$REPO_DIR/gpu/spike/src" "$REPO_DIR/gpu/spike/data" "$REPO_DIR/gpu/spike/pyproject.toml" "$REPO_DIR/gpu/spike/uv.lock" "$HOST:$SPIKE/"

# 실행마다 다른 폴더를 쓴다. --resume이 겹쳐도 서로의 폴더를 지우지 않는다.
REMOTE_JOB="$SPIKE/outputs/batch/$RENDER_ID-$(basename "$LOCAL_ROOT")"
ssh "$HOST" "mkdir -p '$SPIKE/outputs/batch'"
rsync -a --chmod=Du=rwx,Dgo=,Fu=rw,Fgo= "$LOCAL_JOB/" "$HOST:$REMOTE_JOB/"
if [ "$ENGINE" = "$DIRECT_ENGINE" ]; then
  ssh "$HOST" "cd '$SPIKE' && CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES='$GPU' $REMOTE_UV run --frozen --extra gpu python -m spike.run_render_job --job '$REMOTE_JOB'"
else
  ssh "$HOST" "cd '$SPIKE' && $REMOTE_UV run --frozen --no-dev --extra audio python -m spike.run_render_job --job '$REMOTE_JOB' --engine '$ENGINE' --compose-url '$COMPOSE_URL'"
fi
rsync -a "$HOST:$REMOTE_JOB/out" "$LOCAL_JOB/"

pnpm --silent render:batch publish --job-dir "$LOCAL_JOB"
