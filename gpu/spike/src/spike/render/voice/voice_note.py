"""목소리 자동 보정이 단위마다 남기는 기록(report의 voice). 순수 데이터."""
from dataclasses import dataclass


@dataclass(frozen=True)
class VoiceNote:
    """judged_style은 판정한 원래 녹음, group·reference는 쓰는 시도의 유사도다. fallback이면 그 단위를 다른 녹음으로 다시 만들었다."""
    judged_style: str
    group: float
    reference: float
    rerolls: int
    fallback: bool
