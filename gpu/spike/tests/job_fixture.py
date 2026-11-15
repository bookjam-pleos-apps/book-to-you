"""API가 쓰는 작업 파일 예시(공용 fixture)로 렌더 작업 폴더를 만든다. API 쪽 테스트도 같은 파일을 읽는다."""
import json
from pathlib import Path

import numpy as np
import soundfile as sf

SHARED_FIXTURES = Path(__file__).parents[3] / "apps/api/src/adapters/render-job/fixtures"
REFERENCE_RATE = 24000
_CALM = {"style": "calm", "pauseAfterMs": 450}
# 묶으면 calm 단위 0(제목+첫 문장), excited 단위 1, calm 단위 2가 된다.
THREE_UNIT_LINES = [
    {**_CALM, "text": "주인님이 집을 비운 사이"},
    {**_CALM, "text": "고양이는 창가에 앉아 있었어요. 강아지는 문 앞을 지켰어요. 생쥐는 부엌을 살폈어요. 모두 조용히 기다렸어요."},
    {**_CALM, "text": "“집 잘 지키고 있어.”", "style": "excited"},
    {**_CALM, "text": "그런데 그때 문밖에서 커다란 소리가 났어요. 모두 깜짝 놀라 귀를 쫑긋 세웠어요. 바람이 세게 불었어요."},
]


def example_job(tmp_path: Path, lines: list[dict] | None = None) -> Path:
    """lines를 주면 예시 작업의 문장만 바꾼다(길이 예산이 30초를 넘는 긴 단위를 만들 때)."""
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    example = json.loads((SHARED_FIXTURES / "job.example.json").read_text(encoding="utf-8"))
    example = example if lines is None else {**example, "lines": lines}
    (job_dir / "job.json").write_text(json.dumps(example, ensure_ascii=False), encoding="utf-8")
    [sf.write(job_dir / reference["file"], np.zeros(REFERENCE_RATE // 10, dtype=np.float32), REFERENCE_RATE) for reference in example["references"]]
    return job_dir
