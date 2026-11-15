"""중단해도 이어 갈 수 있는 실험의 실행 기록을 읽고 쓴다. 조건 라벨은 폴더 이름이 아니라 이 기록을 믿는다."""
import json
from pathlib import Path

from spike.sound.atomic import atomic_path

RUN_NAME = "run.json"


def load_run(out: Path) -> list[dict]:
    path = out / RUN_NAME
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def save_run(out: Path, records: list[dict]) -> None:
    with atomic_path(out / RUN_NAME) as tmp:
        tmp.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
