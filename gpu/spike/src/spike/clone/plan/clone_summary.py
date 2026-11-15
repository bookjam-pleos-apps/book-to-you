"""클론 메타를 실험별로 요약한다. 순수 함수."""
from statistics import median


def summarize(meta: dict[str, dict]) -> dict[str, dict]:
    experiment_ids = sorted({entry["experiment"] for entry in meta.values()})
    return {eid: _summary([e for e in meta.values() if e["experiment"] == eid]) for eid in experiment_ids}


def _summary(entries: list[dict]) -> dict:
    """speedX는 오디오 길이 ÷ 생성 시간(배속). 1 이상이면 실시간보다 빠르다."""
    return {
        "generated": len(entries),
        "hitBudget": sum(e["hitBudget"] for e in entries),
        "medianSpeedX": median(e["speedX"] for e in entries),
    }
