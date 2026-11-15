#!/usr/bin/env bash
# 폰으로 녹음한 계정의 최신 목소리로 동화 한 편을 혼합 스타일로 렌더해 차 책장에 올린다(약 4분).
# 사용: scripts/e2e-render.sh <이메일> [--story masteraway|redhood|fisherman] [render-batch.sh 옵션, 예: --clip <id>]
# DGX는 공유 장비다. GPU 프로세스를 보여 주고 사람이 y를 눌러야 그 PID들과 함께 쓰도록 허용한다.
set -euo pipefail
. "$(dirname "$0")/lib/e2e-common.sh"

USAGE="사용: $0 <이메일> [--story masteraway|redhood|fisherman] [--clip <id>]..."
[ $# -ge 1 ] || { echo "$USAGE" >&2; exit 2; }
EMAIL="$1"
shift
STORY=masteraway
if [ "${1:-}" = --story ]; then
  [ $# -ge 2 ] || { echo "$USAGE" >&2; exit 2; }
  STORY="$2"
  shift 2
fi

run_sql() {
  (cd "$ROOT" && docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -v ON_ERROR_STOP=1 -v email="$1"' _ "$EMAIL")
}

latest_voice_row() {
  run_sql <<'SQL'
SELECT v.id, v.label
FROM voice_profiles v
JOIN users u ON u.id = v.user_id
LEFT JOIN consent_records c ON c.id = v.active_consent_id
WHERE lower(u.email) = lower(:'email')
ORDER BY c.given_at DESC NULLS LAST
LIMIT 1;
SQL
}

passed_clips_of() {
  run_sql <<SQL
SELECT style, id, round(coalesce(cer, -1)::numeric, 3) FROM voice_clips
WHERE voice_profile_id = '$1' AND status = 'passed' ORDER BY style;
SQL
}

sync_spike_code() {
  step "DGX에 지금 코드 올리기와 uv sync (${SPIKE})"
  rsync -a --exclude '__pycache__' --exclude '.venv*' --exclude 'outputs' --exclude 'recordings' \
    "$ROOT/gpu/spike/src" "$ROOT/gpu/spike/data" "$ROOT/gpu/spike/pyproject.toml" "$ROOT/gpu/spike/uv.lock" "$DGX_HOST:$SPIKE/"
  ssh "$DGX_HOST" "cd '$SPIKE' && PATH=\"\$HOME/.local/bin:\$PATH\" uv sync --frozen --extra gpu -q"
  ok "동기화"
}

ask_gpu_share() {
  step "DGX GPU 사용 허용"
  ssh "$DGX_HOST" "free -g | awk 'NR==2 { print \"  가용 메모리: \" \$7 \"GB\" }'"
  local apps
  apps="$(ssh "$DGX_HOST" 'nvidia-smi -i 0 --query-compute-apps=pid,process_name,used_memory --format=csv,noheader')"
  printf '%s\n' "${apps:-  (없음)}" | sed 's/^/    /'
  # 앞의 ssh가 표준 입력을 먹고, 파이프로 y를 넣는 자동 허용도 막아야 하므로 터미널에서만 답을 받는다.
  local answer=""
  read -r -p "  위 프로세스와 GPU를 함께 써도 될까요? (y/n) " answer </dev/tty 2>/dev/tty || answer=""
  [ "$answer" = y ] || die "허용하지 않아 멈춥니다. 렌더하지 않았습니다."
  SHARE_WITH="$(printf '%s\n' "$apps" | awk -F', ' 'NF > 0 { print $1 }' | paste -sd, -)"
}

main() {
  step "목소리 찾기 (${EMAIL})"
  local row voice label
  row="$(latest_voice_row)"
  [ -n "$row" ] || die "${EMAIL} 계정에 목소리가 없습니다. 폰에서 녹음했는지, 이메일이 맞는지 보세요."
  voice="${row%%|*}" label="${row#*|}"
  echo "  ${label} (${voice}), 통과 클립(style|id|cer):"
  passed_clips_of "$voice" | sed 's/^/    /'
  SPIKE="$(ssh "$DGX_HOST" 'echo $HOME')/${DGX_SPIKE_DIR}"
  sync_spike_code
  ask_gpu_share
  step "렌더 (${STORY}, 혼합 스타일)"
  local started=$SECONDS
  local share=()
  [ -z "$SHARE_WITH" ] || share=(--share-with "$SHARE_WITH")
  "$ROOT/apps/api/scripts/render-batch.sh" --voice "$voice" --story "$STORY" --host "$DGX_HOST" --spike "$SPIKE" \
    ${share[@]+"${share[@]}"} "$@"
  printf '\n\033[1;32m✔ %s 목소리로 %s 렌더·게시 완료 (%s초). 차 앱 책장을 다시 여세요.\033[0m\n' "$label" "$STORY" "$((SECONDS - started))"
}

main "$@"
