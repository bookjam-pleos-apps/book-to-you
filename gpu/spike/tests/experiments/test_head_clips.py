import json
from pathlib import Path

import numpy as np
import pytest

from spike.sound.audio import Audio
from spike.listening.head_clips import HeadMark, chain_verdict, head_clip_samples, pooled_clips, require_late_junctions
from spike.listening.listening_plan import Clip, SpeechSpan, place_clips
from spike.listening.listening_store import KEY_NAME, listening_folder
from spike.render.trials.run_store import save_run
from spike.experiments.listening.run_story_head_clips import _finished_run, judge

RATE = 1000


def test_head_clip_keeps_saved_tail_and_pause_then_new_head():
    story = Audio(np.linspace(0.1, 0.2, 20000, dtype=np.float32), RATE)
    head = Audio(np.concatenate([np.zeros(100, dtype=np.float32), np.full(3900, 0.3, dtype=np.float32)]), RATE)
    clip = head_clip_samples(story, SpeechSpan(0, 10000), 11000, head)
    assert np.array_equal(clip[:4000], story.samples[7000:11000])
    assert len(clip) == 4000 + 100 + 3000


def test_head_without_speech_stops():
    story = Audio(np.ones(20000, dtype=np.float32), RATE)
    with pytest.raises(ValueError, match="말소리"):
        head_clip_samples(story, SpeechSpan(0, 10000), 11000, Audio(np.zeros(1000, dtype=np.float32), RATE))


def test_pool_gives_each_clip_its_own_range():
    audio, clips = pooled_clips([np.zeros(3, dtype=np.float32), np.ones(2, dtype=np.float32)], [5, 6], RATE)
    assert clips == [Clip("boundary", 5, 0, 3), Clip("boundary", 6, 3, 5)]
    assert len(audio.samples) == 5


def _marks(current: dict[int, int], chain: dict[int, int], units=(6, 7), per_seed: int = 5) -> list[HeadMark]:
    """seed별로 몇 번째 단위까지 지목했는지를 받아 표로 편다."""
    return [
        HeadMark(condition, unit, seed, index < counts[seed])
        for condition, counts in (("current", current), ("chain", chain))
        for seed in counts
        for index, unit in enumerate(units * per_seed)
    ]


def test_chain_passes_with_a_large_drop_in_both_seed_halves():
    verdict = chain_verdict(_marks({1: 8, 2: 8}, {1: 2, 2: 2}))
    assert verdict.current_rate == pytest.approx(0.8)
    assert verdict.chain_rate == pytest.approx(0.2)
    assert verdict.passed


def test_small_drop_does_not_pass():
    assert not chain_verdict(_marks({1: 5, 2: 5}, {1: 3, 2: 3})).passed


def test_drop_from_one_seed_half_alone_does_not_pass():
    verdict = chain_verdict(_marks({1: 10, 2: 2}, {1: 0, 2: 4}))
    assert verdict.current_rate - verdict.chain_rate >= 0.3
    assert verdict.late_seed_drop < 0
    assert not verdict.passed


def test_junction_unit_stays_out_of_the_verdict():
    main = _marks({1: 8, 2: 8}, {1: 2, 2: 2})
    extra = [HeadMark("chain", 5, seed, True) for seed in (1, 2)] + [HeadMark("current", 5, seed, False) for seed in (1, 2)]
    assert chain_verdict([*main, *extra]) == chain_verdict(main)


def test_early_junction_outside_the_excluded_unit_stops():
    with pytest.raises(ValueError, match=r"\[17\]"):
        require_late_junctions([{"unit": 17, "junctionSec": 1.0}])


def test_excluded_unit_and_late_junctions_pass():
    require_late_junctions([{"unit": 5, "junctionSec": 0.4}, {"unit": 17, "junctionSec": 15.4}, {"unit": 6, "junctionSec": None}])


def test_unfinished_run_cannot_become_a_listening_file(tmp_path: Path):
    save_run(tmp_path, [{"file": "chain/0005_5000.wav", "unit": 5, "junctionSec": 0.4}])
    with pytest.raises(ValueError, match="아직 생성되지 않은"):
        _finished_run(tmp_path)


def _saved_key(heads: Path) -> int:
    """7초 클립 2개짜리 정답표를 쓰고 첫 클립 시작 초를 돌려준다."""
    rate = 24000
    clips = [Clip("boundary", 6, 0, 7 * rate), Clip("boundary", 7, 7 * rate, 14 * rate)]
    placed = place_clips(clips, 3 * rate, rate)
    lines = [
        {"order": order, "clip": vars(item.clip), "at": item.at, "condition": condition, "seed": 1, "startsWithQuote": False}
        for order, (item, condition) in enumerate(zip(placed, ("current", "chain")))
    ]
    folder = listening_folder(heads)
    folder.mkdir()
    (folder / KEY_NAME).write_text(json.dumps({"sampleRate": rate, "clips": lines}), encoding="utf-8")
    return placed[0].at // rate


def _clock(seconds: int) -> str:
    return f"{seconds // 60}:{seconds % 60:02d}"


def test_mark_near_a_clip_change_withholds_the_verdict(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    start = _saved_key(tmp_path)
    judge(tmp_path, [_clock(start)])
    output = capsys.readouterr().out
    assert "판정을 내지 않습니다" in output
    assert "ChainVerdict" not in output


def test_mark_outside_every_clip_withholds_the_verdict(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    _saved_key(tmp_path)
    judge(tmp_path, ["9:59"])
    assert "판정을 내지 않습니다" in capsys.readouterr().out
