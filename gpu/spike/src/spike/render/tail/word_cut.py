"""낱말 꼬리("그래.")를 붙여 생성한 소리에서 꼬리 앞 쉼 후보와, 그 쉼을 확인할 받아쓰기 조각을 만든다. 어댑터(numpy).

후보는 끝에서 가까운 쉼 가운데 쉼 뒤 말소리가 낱말 하나 길이인 것이다. 모델은 "그래" 앞에서 0.04~0.06초만 쉬기도 해서
(exp_tail_word 진단 10단위 중 7) 쉼 기준을 반복 꼬리보다 짧게 둔다.
받아쓸 조각은 생성음 전체(꼬리를 말했는지)와 후보마다 잘라 낸 앞부분(말끝이 남았는지)이다. 짧은 꼬리 조각만 받아쓰면
whisper가 없는 말("MBC 뉴스 ...")을 지어내거나 끝말을 빠뜨려(같은 진단) 쓰지 않는다. 고르기는 tail_match가 한다.
"""
from spike.sound.audio import Audio
from spike.sound.audio_gaps import FRAME_SEC, Gap, faded_head, frame_db, inner_gaps, voiced_span

WORD_SEC = (0.12, 1.0)
WORD_MIN_GAP_SEC = 0.03
MAX_CANDIDATES = 3


def word_gaps(audio: Audio) -> list[Gap]:
    """늦은 쉼부터 최대 MAX_CANDIDATES개."""
    db = frame_db(audio.samples, audio.sample_rate)
    span = voiced_span(db)
    if span is None:
        return []
    gaps = inner_gaps(db, span, WORD_MIN_GAP_SEC)
    fitting = [gap for gap in gaps if WORD_SEC[0] <= (span[1] + 1 - gap[1]) * FRAME_SEC <= WORD_SEC[1]]
    return sorted(fitting, reverse=True)[:MAX_CANDIDATES]


def word_clips(audio: Audio) -> list[Audio]:
    """[생성음 전체, 후보 0에서 자른 앞부분, 후보 1에서 자른 앞부분, ...]"""
    return [audio, *(faded_head(audio, gap) for gap in word_gaps(audio))]


def cut_before(audio: Audio, candidate: int) -> Audio:
    return faded_head(audio, word_gaps(audio)[candidate])
