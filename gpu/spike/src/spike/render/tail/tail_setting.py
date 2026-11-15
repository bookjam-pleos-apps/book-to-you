"""제품 렌더가 쓰는 꼬리 방식을 데이터 파일에서 읽는다. 어댑터(파일)."""
import json
from pathlib import Path

from spike.clone.catalog import DATA_DIR
from spike.render.tail.tail_plan import TAIL_MODES, TailSetting

TAIL_FILE = "render-tail.json"


def tail_setting_from(raw: dict) -> TailSetting:
    mode, word = raw["mode"], raw["word"]
    if mode not in TAIL_MODES:
        raise ValueError(f"꼬리 방식은 {TAIL_MODES} 중 하나입니다: {mode}")
    if not word.strip():
        raise ValueError("꼬리 낱말이 비어 있습니다")
    return TailSetting(mode, word.strip())


def load_tail_setting(data_dir: Path = DATA_DIR) -> TailSetting:
    return tail_setting_from(json.loads((data_dir / TAIL_FILE).read_text(encoding="utf-8")))
