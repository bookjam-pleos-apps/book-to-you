"""model-compose 워크플로우 호출. 오디오 없이 쓰는 호출자가 numpy를 끌어오지 않도록 표준 라이브러리만 쓴다."""
import json
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REQUEST_TIMEOUT_SEC = 600
SSE_DATA_PREFIX = "data: "


class ComposeError(RuntimeError):
    pass


def run_workflow(url: str, workflow_id: str, workflow_input: dict) -> bytes:
    body = json.dumps({"workflow_id": workflow_id, "input": workflow_input, "output_only": True}).encode("utf-8")
    request = Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SEC) as response:
            return response.read()
    except HTTPError as error:
        raise ComposeError(f"{workflow_id} 실패 ({error.code}): {error.read().decode('utf-8', 'replace')}") from error
    except (URLError, TimeoutError) as error:
        raise ComposeError(f"{workflow_id} 호출 실패 ({url}): {error}") from error
    except IncompleteRead as error:
        # 스트림 출력은 200을 보낸 뒤에 실패할 수 있다. 그때 서버는 응답을 끝맺지 않고 연결을 닫는다.
        raise ComposeError(f"{workflow_id} 응답이 중간에 끊겼습니다 ({len(error.partial)}바이트 받음)") from error


def _data_lines(event: str) -> list[str]:
    return [line.removeprefix(SSE_DATA_PREFIX) for line in event.split("\n") if line.startswith(SSE_DATA_PREFIX)]


def parse_event_stream(body: bytes) -> list[object]:
    """`as stream/json` 출력은 SSE로 온다. 이벤트마다 data 줄을 이어 붙여 JSON 값 하나로 읽는다."""
    events = body.decode("utf-8").replace("\r\n", "\n").split("\n\n")
    payloads = ["\n".join(_data_lines(event)) for event in events]
    return [json.loads(payload) for payload in payloads if payload]


def run_workflow_events(url: str, workflow_id: str, workflow_input: dict) -> list[object]:
    return parse_event_stream(run_workflow(url, workflow_id, workflow_input))
