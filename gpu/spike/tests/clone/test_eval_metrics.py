import numpy as np
import pytest

from fakes import SAMPLE_RATE, silence, tone
from spike.sound.audio import Audio
from spike.clone.scoring.eval_metrics import cer, longest_missing_run, normalize_for_cer, repeats_previous, syllables_per_sec
from spike.sound.speech_activity import voiced_duration


def _tone_with_silence(lead_sec: float, voiced_sec: float, tail_sec: float) -> Audio:
    return Audio(np.concatenate([silence(lead_sec), tone(sec=voiced_sec), silence(tail_sec)]), SAMPLE_RATE)


PREVIOUS = "개구리 한 마리가 물 위에 내밀고 있었습니다."
NEXT = "오오, 네가 지금 말하였니? 하고 묻고 나서"


def test_previous_tail_at_the_head_of_the_transcript_is_a_repeat():
    assert repeats_previous(PREVIOUS, f"있었습니다 {NEXT}", NEXT)


def test_clean_transcript_is_not_a_repeat():
    assert not repeats_previous(PREVIOUS, NEXT, NEXT)


def test_words_the_script_itself_shares_with_the_previous_tail_are_not_a_repeat():
    text = "내밀고 있었습니다 하고 말하였습니다"
    assert not repeats_previous(PREVIOUS, text, text)


def test_two_character_repeat_is_below_the_detection_limit():
    assert not repeats_previous(PREVIOUS, f"니다 {NEXT}", NEXT)


def test_repeat_past_the_head_of_the_passage_is_outside_the_detector():
    script = f"{NEXT} 왕녀는 황금공을 찾아 달라고 하였습니다"
    assert not repeats_previous(PREVIOUS, f"{script} 내밀고 있었습니다 내밀고 있었습니다", script)


def test_normalize_drops_spaces_and_punctuation():
    assert normalize_for_cer("와, 오늘은 소풍 가는 날!") == "와오늘은소풍가는날"


def test_cer_ignores_spacing_and_punctuation():
    assert cer("와, 오늘은 소풍!", "와 오늘은소풍") == 0.0


@pytest.mark.parametrize(
    ("hypothesis", "edits"),
    [("토끼가잤", 1), ("토끼나잤어", 1), ("토끼가잤어요", 1), ("끼가잤어토", 2), ("", 5)],
)
def test_cer_is_edit_distance_over_reference_length(hypothesis: str, edits: int):
    assert cer("토끼가잤어", hypothesis) == pytest.approx(edits / 5)


def test_cer_reads_digits_the_way_the_reference_does():
    reference = "토토는 도토리를 하나, 둘, 셋, 모두 일곱 개나 주웠어요."
    assert cer(reference, "토토는 도토리를 1, 2, 3, 모두 7개나 주웠어요.") == 0.0
    assert cer("세 마리", "3마리") == 0.0


def test_cer_of_empty_reference():
    assert cer("", "") == 0.0
    assert cer("!", "가") == 1.0


def test_voiced_duration_trims_leading_and_trailing_silence():
    audio = _tone_with_silence(0.5, 1.0, 0.7)
    assert voiced_duration(audio) == pytest.approx(1.0, abs=0.03)


def test_syllables_per_sec_uses_voiced_duration():
    audio = _tone_with_silence(0.5, 2.0, 0.5)
    assert syllables_per_sec("토끼가 잠을 잤어요", audio) == pytest.approx(4.0, rel=0.03)


def test_silent_audio_has_no_speech_rate():
    silent = Audio(np.zeros(SAMPLE_RATE, dtype=np.float32), SAMPLE_RATE)
    assert voiced_duration(silent) == 0.0
    assert syllables_per_sec("토끼", silent) is None


def test_short_sentence_dropped_from_a_long_unit_is_found_even_when_cer_passes():
    kept = "옛날 옛적 아주 먼 나라에 마음씨 고운 왕녀님이 살았습니다 어느 날 왕녀님은 숲으로 산책을 나갔습니다"
    dropped = "그 공은 금빛이었어요"
    text = f"{kept} {dropped} 그리고 연못가에 앉아 오래도록 쉬었습니다"
    transcript = f"{kept} 그리고 연못가에 앉아 오래도록 쉬었습니다"
    assert cer(text, transcript) <= 0.2
    assert longest_missing_run(text, transcript) == len(normalize_for_cer(dropped))


def test_missing_run_is_zero_for_a_faithful_transcript_with_other_spacing():
    assert longest_missing_run("옛날 옛적, 아주 옛적에", "옛날옛적 아주옛적에.") == 0


def test_missing_tail_and_empty_transcript_count_as_missing():
    assert longest_missing_run("가나다라마바사아자차", "가나다라마") == 5
    assert longest_missing_run("가나다라마", "") == 5


def test_extra_words_are_not_counted_as_missing():
    assert longest_missing_run("가나다라마바사", "가나다라마바사 아자차카") == 0
