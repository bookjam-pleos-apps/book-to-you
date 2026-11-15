#!/usr/bin/env bash
# 개발용: 차량 화면의 8자리 코드를 부모 계정으로 확인한다(웹 화면 대신).
# OTP는 로컬 API의 dev 메일러가 로그에 쓴 값을 읽는다.
# 사용: EMAIL=parent@example.com ./confirm-pairing.sh ABCD2345
#   API=http://127.0.0.1:3000  API_LOG=/tmp/vs-api.log  (기본값)
set -euo pipefail

CODE="${1:?usage: EMAIL=... $0 USER_CODE}"
EMAIL="${EMAIL:?EMAIL is required}"
API="${API:-http://127.0.0.1:3000}"
API_LOG="${API_LOG:-/tmp/vs-api.log}"
JSON=(-H "content-type: application/json")

request_otp() {
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "${JSON[@]}" -d "{\"email\":\"$EMAIL\"}" "$API/v1/auth/otp/request")
  [ "$status" = 202 ] || { echo "otp request failed: $status" >&2; exit 1; }
  sleep 1
  grep "\[dev mail\] $EMAIL OTP" "$API_LOG" | tail -1 | awk '{print $NF}'
}

# __Host- 쿠키는 평문 HTTP에서 curl 쿠키 저장소가 거부하므로 Set-Cookie를 직접 읽는다.
login() {
  local otp="$1" terms
  terms=$(curl -s "$API/v1/terms")
  local body
  body=$(python3 -c 'import json,sys; t=json.loads(sys.argv[1]); print(json.dumps({"email":sys.argv[2],"code":sys.argv[3],**t}))' "$terms" "$EMAIL" "$otp")
  curl -s -D - -o /dev/null -X POST "${JSON[@]}" -d "$body" "$API/v1/auth/otp/verify" |
    grep -i '^set-cookie: __Host-sid=' | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+);.*/\1/'
}

OTP=$(request_otp)
[ -n "$OTP" ] || { echo "OTP not found in $API_LOG" >&2; exit 1; }
COOKIE=$(login "$OTP")
[ -n "$COOKIE" ] || { echo "login failed" >&2; exit 1; }
STATUS=$(curl -s -o /dev/stderr -w '%{http_code}' -X POST "${JSON[@]}" -H "cookie: $COOKIE" \
  -d "{\"userCode\":\"$CODE\"}" "$API/v1/devices/pair/confirm")
echo "pair/confirm: $STATUS (204 = 연결됨)"
