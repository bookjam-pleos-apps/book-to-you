"""시험 세트의 어휘(지목 종류, 항목 라벨, 층). 데이터 파일의 문자열은 여기 타입을 통과해야만 들어온다."""
from typing import Literal, TypeGuard, get_args

Kind = Literal["tone_jump", "not_my_voice", "voice_or_tone", "narration_dragged", "assembly_volume"]
Label = Literal["flagged", "normal"]
Tier = Literal["core", "reserve"]

KINDS: tuple[Kind, ...] = get_args(Kind)
TONE_JUMP: Kind = "tone_jump"
# 조립 실수(음량 미맞춤)는 모델 실패가 아니라 보정과 짝 고르기에서 뺀다.
EXCLUDED_KINDS: frozenset[Kind] = frozenset({"assembly_volume"})


def is_kind(value: object) -> TypeGuard[Kind]:
    return value in KINDS


def is_label(value: object) -> TypeGuard[Label]:
    return value in get_args(Label)


def is_tier(value: object) -> TypeGuard[Tier]:
    return value in get_args(Tier)


# 관찰 출처: 이야기 전체를 들은 청취와, 섞은 클립만 들은 확인 청취. 확인 청취는 지표 일치의 청취 층에 넣지 않는다.
Source = Literal["listening", "clip_check"]
LISTENING: Source = "listening"
CLIP_CHECK: Source = "clip_check"
# 확인 청취가 항목에 남긴 결과
Confirmation = Literal["reproduced", "not_reproduced", "confirmed_normal"]


def is_source(value: object) -> TypeGuard[Source]:
    return value in get_args(Source)


def is_confirmation(value: object) -> TypeGuard[Confirmation]:
    return value in get_args(Confirmation)
