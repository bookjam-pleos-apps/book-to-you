"""compose shell 단계의 공통 출력 규칙. 결과는 JSON 한 줄로 stdout에 쓴다.

model-compose shell 컴포넌트는 실패해도 예외를 내지 않는다(exit_code만 남김). 그래서 어떤 실패든 stdout을 비운 채
0이 아닌 코드로 끝낸다. 다음 `${result.stdout as json}` 해석이 실패해 워크플로우가 그 자리에서 멈춘다.
"""
import json
import sys
import traceback
from collections.abc import Callable


def run_json_step(step: Callable[[], object]) -> int:
    try:
        result = step()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0
