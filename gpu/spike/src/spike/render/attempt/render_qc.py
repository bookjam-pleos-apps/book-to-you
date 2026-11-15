"""생성 한 번의 결과를 대본과 비교해 판정한다. 순수 로직."""
from dataclasses import dataclass, replace

from spike.clone.engine.clone_port import CloneRequest
from spike.clone.scoring.eval_metrics import MAX_MISSING_CHARS, cer, longest_missing_run, repeats_previous

MAX_CER = 0.2


@dataclass(frozen=True)
class AttemptCheck:
    hit_budget: bool
    repeats_context: bool
    missing_chars: int
    error_rate: float

    @property
    def passed(self) -> bool:
        """CER은 긴 단위에서 짧은 문장 누락을 평균으로 숨기므로 빠진 구간을 따로 본다."""
        return (
            self.error_rate <= MAX_CER
            and not self.hit_budget
            and not self.repeats_context
            and self.missing_chars <= MAX_MISSING_CHARS
        )

    @property
    def failure_rank(self) -> tuple[bool, bool, int, float]:
        """작을수록 덜 나쁘다. 폭주와 앞 대본 반복은 귀에 바로 들리므로 전사 오류보다 먼저 피한다."""
        return (self.hit_budget, self.repeats_context, self.missing_chars, self.error_rate)


def _repeats_context(request: CloneRequest, transcript: str) -> bool:
    """실제로 넣은 문맥과만 비교한다. 문맥 없는 시도를 쓰지도 않은 문맥과 견주면 다음 묶음의 체이닝까지 끊긴다."""
    return request.context is not None and repeats_previous(request.context.text, transcript, request.text)


def transcript_check(text: str, transcript: str, hit_budget: bool = False) -> AttemptCheck:
    """받아쓰기와 길이 예산만으로 판정한다. 문맥 반복은 보지 않는다(check_attempt가 더한다)."""
    return AttemptCheck(
        hit_budget=hit_budget,
        repeats_context=False,
        missing_chars=longest_missing_run(text, transcript),
        error_rate=cer(text, transcript),
    )


def check_attempt(request: CloneRequest, unit_text: str, hit_budget: bool, transcript: str) -> AttemptCheck:
    """판정 식은 transcript_check 하나에 두고, 문맥을 넣은 시도만 앞 대본 반복을 더 본다.
    받아쓰기는 단위 원문과 견준다. 모델에 보낸 글(request.text)은 원문과 다를 수 있다."""
    return replace(transcript_check(unit_text, transcript, hit_budget), repeats_context=_repeats_context(request, transcript))
