"""앞부분 비교의 조건표를 읽는다."""
import json
from pathlib import Path

from spike.clone.catalog import DATA_DIR
from spike.render.trials.story_heads import HeadPlan, parse_head_plan

PLAN_NAME = "story-heads.json"


def load_head_plan(data_dir: Path = DATA_DIR, name: str = PLAN_NAME) -> HeadPlan:
    return parse_head_plan(json.loads((data_dir / name).read_text(encoding="utf-8")))
