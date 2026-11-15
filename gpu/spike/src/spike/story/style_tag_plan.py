"""style-tagging 호출의 입력과 응답. 서비스를 띄우지 않고 시험할 수 있는 순수 로직이다."""
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
STYLE_FIELD = "style"


@dataclass(frozen=True)
class ContextWindow:
    before: int
    after: int
    max_chars: int


@dataclass(frozen=True)
class StyleSchema:
    fields: Mapping[str, dict]
    context: ContextWindow
    min_confidence: float


def load_style_schema(data_dir: Path = DATA_DIR) -> StyleSchema:
    """메타 키는 서비스로 보내지 않는다. Nimble은 필드 맵에 스펙이 아닌 값이 있으면 거부한다."""
    raw = json.loads((data_dir / "style-schema.json").read_text(encoding="utf-8"))
    context = raw["context"]
    return StyleSchema(
        raw["schema"],
        ContextWindow(context["before"], context["after"], context["maxChars"]),
        raw["minConfidence"],
    )


def _prompt(texts: Sequence[str], index: int, window: ContextWindow) -> str:
    before = texts[max(0, index - window.before) : index]
    after = texts[index + 1 : index + 1 + window.after]
    sections = (("BEFORE", before), ("TARGET", [texts[index]]), ("AFTER", after))
    return "\n\n".join(f"{label}:\n" + "\n".join(lines) for label, lines in sections if lines)


def _narrower(window: ContextWindow) -> ContextWindow:
    if window.before >= window.after:
        return replace(window, before=window.before - 1)
    return replace(window, after=window.after - 1)


def tagging_text(texts: Sequence[str], index: int, window: ContextWindow) -> str:
    """토큰 한도를 넘으면 호출이 실패하므로, 넘기 전에 먼 문맥부터 줄인다. 대상 문장은 줄이지 않는다."""
    text = _prompt(texts, index, window)
    if len(text) <= window.max_chars or window.before + window.after == 0:
        return text
    return tagging_text(texts, index, _narrower(window))


def _scores_in(payload: bytes) -> Mapping[str, float]:
    """잡의 output 이름이 틀리면 서비스는 오류 없이 null을 돌려준다."""
    try:
        return json.loads(payload)["fields"][STYLE_FIELD]["scores"]
    except (TypeError, KeyError) as error:
        raise ValueError(f"응답에 점수가 없습니다: {payload[:200]!r}") from error


def parse_scores(payload: bytes, choices: Sequence[str]) -> dict[str, float]:
    """보기와 다른 응답은 서비스나 스키마가 바뀐 것이다. 초안으로 흘려보내지 않는다."""
    scores = _scores_in(payload)
    if sorted(scores) != sorted(choices):
        raise ValueError(f"후보가 스키마와 다릅니다: {sorted(scores)}")
    return {choice: float(scores[choice]) for choice in choices}


def top_style(probabilities: Mapping[str, float]) -> str:
    return max(probabilities, key=lambda style: probabilities[style])
