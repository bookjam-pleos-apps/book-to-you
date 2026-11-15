"""반복 후 자르기가 제대로 됐는지 길이로 보는 경고. 판정은 바꾸지 않는다. 순수 로직.

whisper는 같은 말이 되풀이되면 한 번만 적어서, 반복 조각이 앞부분에 남아도 받아쓰기 QC를 통과할 수 있다(exp_repeat_tail).
두 번 읽혔다면 앞부분이 전체 생성음에서 차지하는 비율이 보낸 글의 음절 비율과 비슷하다. 한 문장 반복이면 0.5 근처이고, 실측은 0.38~0.62였다.
"""
from spike.render.tail.repeat_tail import head_fraction
from spike.story.story_plan import StorySentence

# 실측 범위(0.38~0.62)와 같은 폭이라 정상도 경계에 걸린다. blind_head 청취(outputs/exp_repeat_product/blind_head) 결과로 다시 맞춘다.
# 분모는 무음을 포함한 전체 길이이고 기대값은 음절 비율이라 두 기준이 다르다.
HEAD_SHARE_TOLERANCE = 0.12


def head_share(head_sec: float, whole_sec: float) -> float | None:
    return None if whole_sec <= 0 else head_sec / whole_sec


def repeat_suspect(sentence: StorySentence, share: float | None) -> bool | None:
    """반복하지 않은 단위나 잴 수 없던 단위는 None이다. True면 잘라 낸 앞부분을 들어 봐야 한다."""
    if sentence.tail is None or sentence.tail.kind != "repeat" or share is None:
        return None
    return abs(share - head_fraction(sentence)) > HEAD_SHARE_TOLERANCE
