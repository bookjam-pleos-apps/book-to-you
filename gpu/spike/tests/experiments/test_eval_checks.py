import json
from pathlib import Path

import pytest

from spike.evaluation.eval_set.eval_checks import ClipAnswer, ClipCheck, apply_checks, check_flags, reproduced
from spike.evaluation.eval_set.eval_items import Listening, Mark, Render
from spike.evaluation.eval_set.eval_set import Unit
from spike.evaluation.eval_set.eval_set_rows import item_from_row, item_row
from spike.evaluation.eval_set.eval_set_store import load_clip_checks
from spike.evaluation.eval_set.eval_strata import listening_strata
from spike.experiments.measure.run_build_eval_set import build_items

# 단위 시작: 0, 2.5, 5.0, 7.5, 10.0, 12.5초 (길이 2초 + 쉼 0.5초)
STORY = Render(
    units=tuple(Unit(text=t, style=s, duration_sec=2.0, pause_after_ms=500)
                for t, s in [("제목", "calm"), ("“와!”", "excited"), ("서술", "calm"), ("“우와!”", "excited"), ("“야호!”", "excited"), ("끝", "calm")]),
    audio=tuple(f"u{i}.wav" for i in range(6)),
)


def answer(unit: int, mark: float | None, my_voice: str = "예", start: float = 2.0, clip: int = 1) -> ClipAnswer:
    return ClipAnswer(clip=clip, render="r", unit=unit, unit_start_sec=start, mark_sec=mark, my_voice=my_voice, reverb_change="아니오")


@pytest.mark.parametrize(("mark", "my_voice", "start", "expected"), [
    (2.0, "예", 2.0, True),      # 단위 시작에 지목
    (6.0, "예", 2.0, False),     # 경계 창(-1~+3초) 밖
    (None, "예", 2.0, False),    # 지목 없음
    (None, "아니오", 2.0, True),  # 내 목소리 아님만으로도 재현
    (4.0, "예", -1.1, True),     # 한가운데 클립은 클립 안 아무 지목
])
def test_reproduction_rule(mark, my_voice, start, expected):
    assert reproduced(answer(3, mark, my_voice, start)) is expected


def test_only_reproduced_clips_become_flags_with_their_kind():
    check = ClipCheck("cf", "f", (answer(1, 2.0, "아니오"), answer(3, None), answer(4, 4.0, "예", -1.0, clip=3)))
    rows = check_flags(check)
    assert [(f.unit, f.kind, f.at_boundary, m.at) for f, m, _ in rows] == [(1, "not_my_voice", True, "clip01@2s"), (4, "tone_jump", False, "clip03@4s")]


def test_checks_confirm_flags_and_normals_and_a_normal_can_turn_into_a_flag():
    listening = Listening(id="x", render="r", file="x.wav", marks=(Mark("0:03", "tone_jump", "튐"), Mark("0:08", "tone_jump", "튐")))
    renders = {"r": STORY}
    before = {i.id: i for i in build_items(renders, [listening])}
    assert before["r#4"].label == "normal"  # 3번의 짝
    check = ClipCheck("cf", "f", (answer(1, 2.0), answer(3, None), answer(4, None, "아니오")))
    items = {i.id: i for i in build_items(renders, [listening], [check])}
    assert (items["r#1"].sure, items["r#1"].confirmation) == (True, "reproduced")
    assert (items["r#3"].sure, items["r#3"].confirmation) == (False, "not_reproduced")
    assert items["r#4"].label == "flagged" and items["r#4"].observations[0].source == "clip_check"


def test_confirmed_normal_becomes_sure():
    normal = build_items({"r": STORY}, [Listening("x", "r", "x.wav", (Mark("0:03", "not_my_voice", "다름"),))])
    target = next(i for i in normal if i.label == "normal")
    (confirmed,) = [i for i in apply_checks(normal, [ClipCheck("cf", "f", (answer(target.unit, None),))]) if i.id == target.id]
    assert (confirmed.sure, confirmed.confirmation) == (True, "confirmed_normal")


def test_clip_check_observations_make_no_listening_stratum():
    check = ClipCheck("cf", "f", (answer(4, None, "아니오"),))
    items = build_items({"r": STORY}, [Listening("x", "r", "x.wav", (Mark("0:03", "tone_jump", "튐"),))], [check])
    values = {("r", u): float(u) for u in range(6)}
    strata = listening_strata(items, values)
    assert len(strata) == 1 and strata[0].flagged == (1.0,)
    assert 4.0 not in strata[0].others  # 확인 청취로 지목된 단위는 비교 쪽에서도 빠진다


def test_rows_round_trip_and_omit_defaults():
    check = ClipCheck("cf", "f", (answer(1, 2.0),))
    items = build_items({"r": STORY}, [Listening("x", "r", "x.wav", (Mark("0:03", "tone_jump", "튐"), Mark("0:08", "tone_jump", "튐")))], [check])
    rows = [item_row(i, STORY, {"x": "x.wav", "cf": "f"}) for i in items]
    plain = next(r for r in rows if r["id"] == "r#3")
    assert "confirmation" not in plain and all("source" not in o for o in plain["observations"])
    assert [item_from_row(r) for r in rows] == items


def test_bad_answers_stop_loading(tmp_path: Path):
    path = tmp_path / "eval-listenings.json"
    clip = {"clip": 1, "render": "r", "unit": 1, "unitStartInClip": 2.0, "mark": "x", "myVoice": "몰라", "reverbChange": "아니오"}
    path.write_text(json.dumps({"kinds": {}, "listenings": [], "clipChecks": [{"id": "cf", "file": "f", "clips": [clip]}]}, ensure_ascii=False))
    with pytest.raises(ValueError, match="내 목소리"):
        load_clip_checks(path)
