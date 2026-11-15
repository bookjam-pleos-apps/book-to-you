#!/usr/bin/env bash
# 지금 무엇이 떠 있는지와 폰 주소·최근 OTP를 보여 준다. 아무것도 바꾸지 않는다.
set -euo pipefail
. "$(dirname "$0")/lib/e2e-common.sh"

print_e2e_status
print_phone_banner
printf '\n  최근 OTP: %s\n' "$(grep 'dev mail' "$WEB_API_LOG" 2>/dev/null | tail -1 || true)"
