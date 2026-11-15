#!/usr/bin/env bash
# Pleos Virtual Console(에뮬레이터 안 8088 포트)의 HTTP API로 차량 값을 넣는다.
# 콘솔은 1초 하트비트가 3초 끊기면 쓰기를 거부(emulator_inactive)하므로 쓰기 전에 하트비트를 띄운다.
# 사용: ./vconsole.sh gear Drive | ./vconsole.sh speed 30 | ./vconsole.sh door rear_left open | ./vconsole.sh state
# 주행 상태: gear Drive만 넣으면 공회전(idling), speed를 0보다 크게 넣어야 실제 주행(moving)이다.
set -euo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
PORT="${VCONSOLE_PORT:-18088}"
BASE="http://127.0.0.1:$PORT"

ensure_session() {
  "$ADB" forward "tcp:$PORT" tcp:8088 >/dev/null
  pgrep -f "vconsole-heartbeat-$PORT" >/dev/null && return 0
  nohup bash -c "exec -a vconsole-heartbeat-$PORT bash -c 'while true; do curl -s -m 2 -X POST \"$BASE/browser/session?client=cli\" >/dev/null; sleep 1; done'" >/dev/null 2>&1 &
  sleep 2
}

door_field() {
  case "$1" in
    rear_left) echo door_rl ;;
    rear_right) echo door_rr ;;
    front_left) echo door_fl ;;
    front_right) echo door_fr ;;
    *) echo "unknown door: $1" >&2; exit 2 ;;
  esac
}

ensure_session
case "${1:-}" in
  gear) curl -s -X POST "$BASE/vehicle/gear?gear=$2" >/dev/null ;;
  speed) curl -s -X POST "$BASE/vehicle/controls?speed=$2" >/dev/null ;;
  door) curl -s -X POST "$BASE/vehicle/body?$(door_field "$2")=$([ "$3" = open ] && echo true || echo false)" >/dev/null ;;
  state) curl -s "$BASE/vehicle/state" ;;
  stop) pkill -f "vconsole-heartbeat-$PORT" || true ;;
  *) echo "usage: $0 gear Park|Reverse|Neutral|Drive | speed <kph> | door rear_left|rear_right open|close | state | stop" >&2; exit 2 ;;
esac
