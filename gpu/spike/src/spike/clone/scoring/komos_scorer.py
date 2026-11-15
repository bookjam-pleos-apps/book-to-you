"""KOMOS(한국어 MOS 예측기) 어댑터. komos 패키지는 레포 의존성에 넣지 않고 측정 명령에서만 붙인다.

run_render_alerts --komos일 때만 import된다. 명령은 run_render_alerts의 docstring에 있다.
"""
from collections.abc import Sequence
from pathlib import Path

KOMOS_SOURCE = "upskyy/komos"


def komos_scores(paths: Sequence[Path]) -> list[float]:
    from komos import KOMOS

    model = KOMOS.from_pretrained(KOMOS_SOURCE).eval()
    # score()는 앞 10초만 잰다. 검증(outputs/eval_set/external_mos.py)도 score()로 쟀으므로 같은 방식을 유지한다.
    return [float(model.score(str(path))) for path in paths]
