"""시연 서버 렌더(run_render_story)가 쓰는 엔진과 배치 크기를 데이터 파일에서 읽는다. 어댑터(파일)."""
import json
from dataclasses import dataclass
from pathlib import Path

from spike.clone.catalog import DATA_DIR
from spike.clone.engine.engine_ids import SERVICE_ENGINE_IDS

ENGINE_FILE = "render-engine.json"


@dataclass(frozen=True)
class EngineSetting:
    engine: str
    batch_size: int


def engine_setting_from(raw: dict) -> EngineSetting:
    """render-story는 서비스 안에서 돌므로 서비스 엔진만 받는다."""
    engine, batch_size = raw["engine"], int(raw["batchSize"])
    if engine not in SERVICE_ENGINE_IDS:
        raise ValueError(f"render-story 엔진은 {SERVICE_ENGINE_IDS} 중 하나입니다: {engine}")
    if batch_size < 1:
        raise ValueError(f"배치 크기는 1 이상입니다: {batch_size}")
    return EngineSetting(engine, batch_size)


def load_engine_setting(data_dir: Path = DATA_DIR) -> EngineSetting:
    return engine_setting_from(json.loads((data_dir / ENGINE_FILE).read_text(encoding="utf-8")))
