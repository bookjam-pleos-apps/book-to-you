import json
from pathlib import Path

import pytest

from spike.clone.scoring.eval_metrics import cer

CASES = json.loads(
    (Path(__file__).resolve().parents[4] / "tests/fixtures/cer-parity.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", CASES)
def test_spike_cer_matches_values_shared_with_api(case: dict):
    assert cer(case["reference"], case["hypothesis"]) == pytest.approx(case["cer"], abs=1e-5)
