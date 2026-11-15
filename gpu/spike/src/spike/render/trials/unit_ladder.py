"""생성 단위의 허용 길이를 재는 사다리 계획과 집계. 같은 동화의 연속한 문장을 묶어 목표 길이의 단위를 만든다. 순수 로직."""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import reduce
from itertools import accumulate
from statistics import mean, median

from spike.clone.budget import count_syllables
from spike.clone.scoring.eval_metrics import MAX_MISSING_CHARS, longest_missing_run, normalize_for_cer
from spike.story.story_plan import StorySentence

# 확정본의 단위는 문단 쉼이 정해 대부분 짧다. 180음절 위는 재지 않고 짧은 단위에 클립을 쓴다.
# 실제 상한은 --limits 파일의 값이고 이 사다리로 다시 정한다.
TARGET_SYLLABLES = (15, 30, 60, 90, 120, 150, 180)
LENGTH_TOLERANCE = 0.15
UNITS_PER_TARGET = 4
SEEDS = (1234, 5234, 9234)
LADDER_PAUSE_MS = 0
TAIL_CHARS = 5
TRANSCRIPT_TAIL_CHARS = 12


@dataclass(frozen=True)
class LadderJob:
    target: int
    unit: int
    seed: int
    sentence: StorySentence


def _fitting_spans(lengths: Sequence[int], target: int) -> list[tuple[int, int]]:
    """각 시작 문장에서 허용 범위 안의 구간 중 목표에 가장 가까운 것을 고른다. 문장이 길면 하한만 넘겨도 다음 목표 길이와 겹친다."""
    low, high = target * (1 - LENGTH_TOLERANCE), target * (1 + LENGTH_TOLERANCE)
    totals = [0, *accumulate(lengths)]

    def span_from(start: int) -> tuple[int, int] | None:
        ends = [end for end in range(start + 1, len(totals)) if low <= totals[end] - totals[start] <= high]
        if not ends:
            return None
        return start, min(ends, key=lambda end: abs(totals[end] - totals[start] - target))

    return [span for span in map(span_from, range(len(lengths))) if span is not None]


def _without_overlap(spans: Sequence[tuple[int, int]]) -> list[tuple[int, int]]:
    def keep_if_clear(kept: list[tuple[int, int]], span: tuple[int, int]) -> list[tuple[int, int]]:
        return [*kept, span] if not kept or span[0] >= kept[-1][1] else kept

    return reduce(keep_if_clear, spans, [])


def _spread(spans: Sequence[tuple[int, int]], count: int) -> list[tuple[int, int]]:
    """이야기 앞쪽에만 몰리지 않게 고르게 뽑는다."""
    return [spans[index * len(spans) // count] for index in range(count)]


def ladder_units(sentences: Sequence[str], target: int, count: int = UNITS_PER_TARGET) -> list[str]:
    spans = _without_overlap(_fitting_spans([count_syllables(text) for text in sentences], target))
    if len(spans) < count:
        raise ValueError(f"{target}음절 단위를 {count}개 만들 수 없습니다: {len(spans)}개")
    return [" ".join(sentences[start:end]) for start, end in _spread(spans, count)]


def ladder_jobs(sentences: Sequence[str], style: str = "calm") -> list[LadderJob]:
    """seed를 안쪽에 두어 어느 길이든 같은 seed 조합을 쓴다. 중단되면 앞 길이부터 결과가 남는다."""
    return [
        LadderJob(target, unit, seed, StorySentence(text, style, LADDER_PAUSE_MS))
        for target in TARGET_SYLLABLES
        for unit, text in enumerate(ladder_units(sentences, target))
        for seed in SEEDS
    ]


def job_key(job: LadderJob) -> str:
    return f"{job.target:03d}_{job.unit:02d}_{job.seed}"


def pending_jobs(jobs: Sequence[LadderJob], finished_keys: set[str]) -> list[LadderJob]:
    return [job for job in jobs if job_key(job) not in finished_keys]


def lost_tail(text: str, transcript: str) -> bool:
    """대본 끝 다섯 글자가 전사 끝부분에 없으면 끝이 잘린 후보다(#55, #181). 전사 오류도 걸리므로 들어서 확인한다."""
    tail = normalize_for_cer(text)[-TAIL_CHARS:]
    return tail not in normalize_for_cer(transcript)[-TRANSCRIPT_TAIL_CHARS:]


@dataclass(frozen=True)
class LadderRow:
    target: int
    clips: int
    mean_sec: float
    retried: int
    failed: int
    tails_lost: int
    omissions: int
    median_cer: float
    rate: float


def _row(target: int, records: Sequence[Mapping]) -> LadderRow:
    seconds = sum(record["durationSec"] for record in records)
    syllables = sum(count_syllables(record["text"]) for record in records)
    return LadderRow(
        target,
        len(records),
        mean(record["durationSec"] for record in records),
        sum(record["attempts"] > 1 for record in records),
        sum(not record["passed"] for record in records),
        sum(lost_tail(record["text"], record["transcript"]) for record in records),
        sum(longest_missing_run(record["text"], record["transcript"]) > MAX_MISSING_CHARS for record in records),
        median(record["cer"] for record in records),
        syllables / seconds,
    )


def ladder_rows(records: Sequence[Mapping]) -> list[LadderRow]:
    targets = sorted({record["target"] for record in records})
    return [_row(target, [record for record in records if record["target"] == target]) for target in targets]
