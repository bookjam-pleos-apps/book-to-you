"""확정 전에 초안의 검수 흔적을 본다. 순수 로직."""
from collections.abc import Mapping, Sequence

from spike.story.story_draft import DraftSentence


def cast_styles(cast: Sequence[Mapping[str, str]]) -> dict[str, str]:
    return {item["name"]: item["style"] for item in cast if "style" in item}


def cast_problems(draft: Sequence[DraftSentence], cast: Sequence[Mapping[str, str]]) -> list[str]:
    """인물마다 녹음이 하나여야 같은 인물이 한 사람처럼 들린다(청취로 확인). 초안을 손으로 고쳐도 확정에서 막는다."""
    fixed = cast_styles(cast)
    return [
        f"{index}번: {line.speaker}의 녹음은 cast에서 {fixed[line.speaker]}인데 {line.confirmed_style}로 확정하려 합니다"
        for index, line in enumerate(draft)
        if line.speaker in fixed and line.confirmed_style is not None and line.confirmed_style != fixed[line.speaker]
    ]


def review_problems(record: Mapping[str, object] | None) -> list[str]:
    """사람 관문을 건너뛴 초안을 막는다. answers가 없는 옛 기록은 다른 작업의 재확정을 막지 않도록 통과시킨다."""
    if not isinstance(record, Mapping):
        return ["검수 기록(reviewRecord)이 없습니다. finalize_draft.py로 사람의 답을 받아 검수를 마치세요"]
    reviewer = record.get("reviewer")
    if not isinstance(reviewer, str) or not reviewer.strip():
        return ["검수 기록에 검수자(reviewer)가 없습니다"]
    return []


def confirmed_review(record: Mapping[str, object]) -> dict[str, object]:
    keys = ("reviewer", "reviewedAt", "answeredRows")
    return {key: record[key] for key in keys if key in record}
