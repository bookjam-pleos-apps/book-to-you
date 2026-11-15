"""생성 결과의 메타데이터(seed, 유사도 등)를 JSON 파일에 누적한다. 재실행 결과는 기존 항목에 합쳐진다."""
import json
from pathlib import Path

from spike.sound.atomic import atomic_path


def read_meta(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def merge_meta(path: Path, entries: dict[str, dict]) -> None:
    """메타는 낡은 출력 판정의 근거라, 중단으로 깨진 JSON이 남지 않게 원자적으로 쓴다."""
    merged = json.dumps({**read_meta(path), **entries}, indent=2, ensure_ascii=False)
    with atomic_path(path) as tmp:
        tmp.write_text(merged)
