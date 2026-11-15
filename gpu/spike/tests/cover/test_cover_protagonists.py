import json
from pathlib import Path

from spike.cover.cover_crop import NormRect
from spike.cover.cover_focus_file import CoverAnalysis, analyses_of, focus_document, with_picks
from spike.cover.cover_protagonists import ProtagonistPick, parse_picks, protagonist_index
from spike.cover.cover_subjects import Subject

REPO = Path(__file__).resolve().parents[4]
SHIPPED_TABLE = REPO / "apps/vehicle/app/src/main/assets/cover_focus.json"
PICKS = REPO / "gpu/spike/data/cover-protagonists.json"

WOLF = NormRect(0.4, 0.2, 0.8, 0.6)
GIRL = NormRect(0.15, 0.36, 0.33, 0.88)
BIRD_ON_WOLF = NormRect(0.6, 0.25, 0.7, 0.4)


def test_picks_the_box_holding_the_point():
    assert protagonist_index([WOLF, GIRL], (0.24, 0.6)) == 1


def test_overlapping_boxes_pick_the_smallest():
    assert protagonist_index([WOLF, BIRD_ON_WOLF], (0.65, 0.3)) == 1


def test_point_outside_every_box_marks_nothing():
    assert protagonist_index([WOLF, GIRL], (0.95, 0.95)) is None


def test_document_marks_exactly_the_picked_subject():
    analyses = with_picks([CoverAnalysis("cover_a", (Subject("wolf", WOLF), Subject("girl", GIRL)))],
                          {"cover_a": ProtagonistPick("소녀", (0.24, 0.6))})
    subjects = focus_document("vlm", "rev", analyses)["covers"]["cover_a"]["subjects"]

    assert [s.get("protagonist", False) for s in subjects] == [False, True]
    assert analyses[0].focus.protagonist == GIRL


def test_cover_without_a_pick_stays_unmarked():
    analyses = with_picks([CoverAnalysis("cover_a", (Subject("girl", GIRL),))], {})

    assert "protagonist" not in focus_document("vlm", "rev", analyses)["covers"]["cover_a"]["subjects"][0]
    assert analyses[0].focus.protagonist is None


def test_shipped_table_marks_one_protagonist_only_on_picked_covers():
    document = json.loads(SHIPPED_TABLE.read_text(encoding="utf-8"))
    picks = parse_picks(json.loads(PICKS.read_text(encoding="utf-8")))
    remarked = focus_document(document["model"], document["revision"], with_picks(analyses_of(document), picks))

    assert remarked == document
    assert set(picks) <= set(document["covers"])
    marks = {name: sum(s.get("protagonist", False) for s in entry["subjects"]) for name, entry in document["covers"].items()}
    assert marks == {name: int(name in picks) for name in document["covers"]}
