"""표지 초점 표(앱 assets/cover_focus.json)를 만든다. 앱은 x, y와 subjects의 박스, 주인공 표시(protagonist)를 읽고,
label은 사람이 확인하려고 남긴다."""
from dataclasses import dataclass

from spike.cover.cover_crop import CoverFocus, NormRect, focus_of
from spike.cover.cover_protagonists import ProtagonistPick, protagonist_index
from spike.cover.cover_subjects import Subject

COVER_FOCUS_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class CoverAnalysis:
    image_name: str
    subjects: tuple[Subject, ...]
    protagonist_point: tuple[float, float] | None = None

    @property
    def protagonist(self) -> int | None:
        if self.protagonist_point is None:
            return None
        return protagonist_index([subject.box for subject in self.subjects], self.protagonist_point)

    @property
    def focus(self) -> CoverFocus | None:
        boxes = [subject.box for subject in self.subjects]
        lead = self.protagonist
        return focus_of(boxes, None if lead is None else boxes[lead])


def with_picks(analyses: list[CoverAnalysis], picks: dict[str, ProtagonistPick]) -> list[CoverAnalysis]:
    return [CoverAnalysis(a.image_name, a.subjects, picks[a.image_name].point if a.image_name in picks else None) for a in analyses]


def analyses_of(document: dict) -> list[CoverAnalysis]:
    """이미 쓴 표에서 분석 결과를 되살린다. 주인공만 다시 고를 때 VLM을 다시 돌리지 않으려고 쓴다."""
    return [
        CoverAnalysis(name, tuple(Subject(s["label"], NormRect(s["left"], s["top"], s["right"], s["bottom"])) for s in entry["subjects"]))
        for name, entry in document["covers"].items()
    ]


def _rect(rect: NormRect) -> dict:
    return {"left": rect.left, "top": rect.top, "right": rect.right, "bottom": rect.bottom}


def _entry(analysis: CoverAnalysis, focus: CoverFocus) -> dict:
    lead = analysis.protagonist
    marks = [{"protagonist": True} if i == lead else {} for i in range(len(analysis.subjects))]
    subjects = [{"label": s.label, **_rect(s.box), **mark} for s, mark in zip(analysis.subjects, marks)]
    return {"x": focus.x, "y": focus.y, "subjects": subjects}


def focus_document(model: str, revision: str, analyses: list[CoverAnalysis]) -> dict:
    """인물을 못 찾은 그림은 표에서 뺀다. 앱은 표에 없는 그림을 가운데로 자른다."""
    covers = {a.image_name: _entry(a, a.focus) for a in analyses if a.focus is not None}
    return {
        "schemaVersion": COVER_FOCUS_SCHEMA_VERSION, "model": model, "revision": revision,
        "covers": dict(sorted(covers.items())),
    }
