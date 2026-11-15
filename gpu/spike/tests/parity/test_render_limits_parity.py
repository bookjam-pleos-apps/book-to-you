import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
API_CONFIG = ROOT / "apps/api/src/config.ts"
SPIKE_LIMITS = ROOT / "gpu/spike/data/render-limits.json"


def _api_limits() -> dict[str, int]:
    declared = re.search(r"limits: \{ maxSyllables: (\d+), minSyllables: (\d+) \}", API_CONFIG.read_text(encoding="utf-8"))
    assert declared is not None, f"{API_CONFIG}에서 batchRender.limits 선언을 찾지 못했습니다"
    return {"maxSyllables": int(declared.group(1)), "minSyllables": int(declared.group(2))}


def test_experiment_limits_match_the_product_render():
    """실험 렌더(run_export_plan --limits)가 제품 렌더와 같은 단위로 묶여야 청취 결과를 제품에 옮길 수 있다."""
    assert json.loads(SPIKE_LIMITS.read_text(encoding="utf-8")) == _api_limits()
