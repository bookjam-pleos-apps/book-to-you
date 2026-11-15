import json
from pathlib import Path

import pytest

from spike.cover.cover_crop import CENTER_FOCUS, CoverFocus, CropRect, NormRect, crop_region, focus_of, pixel_crop
from spike.cover.cover_focus_file import CoverAnalysis, focus_document
from spike.cover.cover_preview_plan import SLOTS, find_images, preview_plan, render_plan
from spike.cover.cover_subjects import Subject, grid_size, parse_subjects

REPO = Path(__file__).resolve().parents[4]
SHARED_CASES = REPO / "apps/vehicle/core/src/test/resources/cover-crop-cases.json"


def _box(raw: dict) -> NormRect:
    return NormRect(raw["left"], raw["top"], raw["right"], raw["bottom"])


def _focus(raw: dict) -> CoverFocus:
    subjects = raw.get("subjects", [])
    lead = next((_box(box) for box in subjects if box.get("protagonist")), None)
    return CoverFocus(raw["x"], raw["y"], tuple(map(_box, subjects)), lead)


@pytest.mark.parametrize("case", json.loads(SHARED_CASES.read_text(encoding="utf-8"))["cases"], ids=lambda c: c["name"])
def test_crop_matches_the_app_on_shared_cases(case: dict):
    crop = crop_region(tuple(case["image"]), tuple(case["slot"]), _focus(case["focus"]))

    assert [crop.left, crop.top, crop.width, crop.height] == pytest.approx(case["expected"], abs=1e-6)


def test_crop_never_leaves_the_image():
    points = (0.0, 0.02, 0.5, 0.98, 1.0)
    crops = [crop_region((900, 494), slot, CoverFocus(x, y)) for slot in ((3, 4), (2, 1), (1, 1)) for x in points for y in points]

    assert all(c.left >= 0 and c.top >= 0 and c.left + c.width <= 900 + 1e-9 and c.top + c.height <= 494 + 1e-9 for c in crops)


def test_grid_rounds_each_side_to_the_vlm_patch():
    assert grid_size(900, 494) == (896, 504)
    assert grid_size(896, 1200) == (896, 1204)
    assert grid_size(10, 10) == (28, 28)


def test_parses_fenced_answer_into_normalized_boxes():
    answer = '```json\n[{"bbox_2d": [0, 252, 448, 504], "label": "cat"}, {"bbox_2d": [1, 2], "label": "bad"}]\n```'

    assert parse_subjects(answer, (896, 504)) == [Subject("cat", NormRect(0.0, 0.5, 0.5, 1.0))]


@pytest.mark.parametrize("answer", ["", "no boxes", "[not json]", '{"bbox_2d": [0, 0, 1, 1]}', '[{"bbox_2d": [9, 9, 1, 1]}]'])
def test_unusable_answers_give_no_subjects(answer: str):
    assert parse_subjects(answer, (896, 504)) == []


def test_focus_is_the_center_of_all_subjects():
    boxes = [NormRect(0.1, 0.2, 0.3, 0.4), NormRect(0.5, 0.6, 0.7, 0.8)]

    assert focus_of(boxes) == CoverFocus(0.4, 0.5, tuple(boxes))
    assert focus_of([]) is None


def test_document_leaves_out_art_without_subjects():
    cat = Subject("cat", NormRect(0.2, 0.2, 0.4, 0.6))
    document = focus_document("vlm", "rev", [CoverAnalysis("cover_b_landscape", ()), CoverAnalysis("cover_a_landscape", (cat,))])

    assert (document["schemaVersion"], document["model"], document["revision"]) == (1, "vlm", "rev")
    assert document["covers"] == {
        "cover_a_landscape": {"x": 0.3, "y": 0.4, "subjects": [{"label": "cat", "left": 0.2, "top": 0.2, "right": 0.4, "bottom": 0.6}]},
    }


def _images():
    names = ("cover_b_landscape.webp", "cover_a_portrait.webp", "other.webp", "cover_a_landscape.webp")
    return find_images([Path(n) for n in names], lambda path: (901, 495) if "landscape" in path.stem else (600, 800))


def test_finds_only_cover_images_in_name_order():
    assert [image.name for image in _images()] == ["cover_a_landscape", "cover_a_portrait", "cover_b_landscape"]


def test_preview_plan_covers_every_story_and_slot_with_the_app_pick():
    plan = preview_plan(_images())

    assert len(plan) == 2 * len(SLOTS)
    assert {(item.story, item.slot.shape, item.image.name) for item in plan} == {
        ("a", "portrait", "cover_a_portrait"), ("a", "landscape", "cover_a_landscape"),
        ("b", "portrait", "cover_b_landscape"), ("b", "landscape", "cover_b_landscape"),
    }


def test_center_focus_matches_center_crop():
    crop = crop_region((900, 494), (3, 4), CENTER_FOCUS)

    assert crop.left == pytest.approx((900 - crop.width) / 2)


def test_pixel_crop_stays_inside_odd_sized_images():
    assert pixel_crop(CropRect(447.5, 0, 577.5, 494), (1025, 494)) == (447, 0, 578, 494)


def test_render_plan_marks_found_subjects_and_pairs_every_slot():
    images = _images()
    cat = CoverFocus(0.3, 0.4, (NormRect(0.2, 0.2, 0.4, 0.6),))
    renders = render_plan(images, {"cover_a_landscape": cat, "cover_a_portrait": None, "cover_b_landscape": None})
    crops = [r for r in renders if r.workflow == "preview-crop"]
    sizes = {str(image.path): image.size for image in images}

    assert [r.name for r in renders if r.workflow == "mark-subjects"] == ["keep/cover_a_landscape.png"]
    assert len(crops) == 2 * 2 * len(SLOTS)
    assert len({r.name for r in renders}) == len(renders)
    assert all(c.input["x"] + c.input["width"] <= sizes[c.input["image_path"]][0] for c in crops)
    assert all(c.input["y"] + c.input["height"] <= sizes[c.input["image_path"]][1] for c in crops)
