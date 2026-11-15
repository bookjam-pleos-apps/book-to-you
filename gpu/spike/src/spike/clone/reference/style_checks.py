"""style 녹음이 calm과 구별되는지 보는 기준. 제품 녹음 대본 파일에서 읽어 API의 업로드 검사와 기준이 갈리지 않는다."""
import json
from dataclasses import dataclass
from pathlib import Path

from spike.clone.catalog import ANCHOR_STYLE

RECORDING_SCRIPTS = Path(__file__).resolve().parents[6] / "content" / "scripts" / "recording-scripts.json"
METRICS = ("pitchShiftSemitones", "speechRateChange")


@dataclass(frozen=True)
class Bound:
    """calm 대비 변화량의 한쪽 경계다. at_least와 at_most 중 하나만 있다."""
    metric: str
    at_least: float | None = None
    at_most: float | None = None


@dataclass(frozen=True)
class StyleCheck:
    """any_of 중 하나만 맞으면 calm과 구별된 것으로 본다."""
    style: str
    any_of: tuple[Bound, ...]


def load_style_checks(path: Path = RECORDING_SCRIPTS) -> list[StyleCheck]:
    raw = json.loads(path.read_text(encoding="utf-8")).get("styleChecks", [])
    checks = [_style_check(item) for item in raw]
    styles = [check.style for check in checks]
    if len(styles) != len(set(styles)):
        raise ValueError(f"style check가 겹친다: {styles}")
    return checks


def _style_check(item: dict) -> StyleCheck:
    """기준점인 calm은 자기 자신과 비교할 수 없고, 조건이 없으면 아무 녹음도 통과하지 못한다."""
    if item["style"] == ANCHOR_STYLE or not item["anyOf"]:
        raise ValueError(f"invalid style check: {item}")
    return StyleCheck(item["style"], tuple(_bound(bound) for bound in item["anyOf"]))


def _bound(item: dict) -> Bound:
    """오타가 나면 검사가 조용히 빠지므로 읽을 때 막는다."""
    bound = Bound(item["metric"], item.get("atLeast"), item.get("atMost"))
    if bound.metric not in METRICS or (bound.at_least is None) == (bound.at_most is None):
        raise ValueError(f"invalid style check bound: {item}")
    return bound
