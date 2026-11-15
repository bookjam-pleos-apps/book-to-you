"""묶음 앞부분만 조건별로 생성하는 계획과 요청을 만든다. 전체를 다시 만들지 않고 조건 차이만 비교한다."""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from spike.clone.engine.clone_port import CloneEngine, CloneRequest, PromptContext, Synthesis
from spike.render.story_chain import chain_context, decoder_junction_sec
from spike.render.story_render import Reference, RenderedSentence

FIRST_UNIT_WITH_PREVIOUS = 1
OPENING_QUOTE = "“"


@dataclass(frozen=True)
class HeadCondition:
    id: str
    chain: bool
    strip_opening_quote: bool = False


@dataclass(frozen=True)
class HeadPlan:
    units: tuple[int, ...]
    seeds: tuple[int, ...]
    conditions: tuple[HeadCondition, ...]
    max_new_tokens: int


@dataclass(frozen=True)
class HeadJob:
    condition: HeadCondition
    unit: int
    seed: int


@dataclass(frozen=True)
class HeadSettings:
    model: str
    reference: Reference
    max_new_tokens: int


def parse_head_plan(raw: Mapping) -> HeadPlan:
    """첫 묶음은 앞 묶음이 없다. 번호 -1은 오류 없이 마지막 묶음을 읽으므로 여기서 막는다."""
    if min(raw["units"]) < FIRST_UNIT_WITH_PREVIOUS:
        raise ValueError(f"앞 묶음이 없는 번호입니다: {raw['units']}")
    conditions = tuple(
        HeadCondition(item["id"], item["chain"], item.get("stripOpeningQuote", False)) for item in raw["conditions"]
    )
    return HeadPlan(tuple(raw["units"]), tuple(raw["seeds"]), conditions, raw["maxNewTokens"])


def head_jobs(plan: HeadPlan) -> list[HeadJob]:
    return [HeadJob(condition, unit, seed) for condition in plan.conditions for unit in plan.units for seed in plan.seeds]


def pending_jobs(jobs: Sequence[HeadJob], records: Sequence[Mapping]) -> list[HeadJob]:
    """이미 끝낸 작업은 건너뛴다. 공유 장비에서 중단되어도 다시 처음부터 쓰지 않는다."""
    done = {record["file"] for record in records}
    return [job for job in jobs if str(head_file(job)) not in done]


def context_units(plan: HeadPlan) -> list[int]:
    """체이닝에 쓸 앞 묶음. 원격 장비에 올릴 음성은 이것뿐이다."""
    return [unit - 1 for unit in plan.units] if any(condition.chain for condition in plan.conditions) else []


def head_file(job: HeadJob) -> Path:
    return Path(job.condition.id) / f"{job.unit:04d}_{job.seed}.wav"


def head_request(job: HeadJob, text: str, context: PromptContext | None, settings: HeadSettings) -> CloneRequest:
    return CloneRequest(
        text=text,
        reference_path=settings.reference.path,
        reference_text=settings.reference.text,
        model=settings.model,
        seed=job.seed,
        non_streaming=True,
        x_vector_only=False,
        context=context,
        max_new_tokens=settings.max_new_tokens,
    )


def head_text(condition: HeadCondition, text: str) -> str:
    """닫는 따옴표는 남긴다. 머리에서 목소리가 바뀌는 원인이 여는 따옴표인지만 가른다."""
    return text.removeprefix(OPENING_QUOTE) if condition.strip_opening_quote else text


def render_head(
    job: HeadJob,
    engine: CloneEngine,
    texts: list[str],
    previous_units: Mapping[int, RenderedSentence],
    settings: HeadSettings,
) -> Synthesis:
    context = chain_context(previous_units[job.unit - 1]) if job.condition.chain else None
    return engine.synthesize(head_request(job, head_text(job.condition, texts[job.unit]), context, settings))


def head_record(job: HeadJob, synthesis: Synthesis, file: Path) -> dict:
    codes = synthesis.prompt_codes
    return {
        "condition": job.condition.id,
        "chain": job.condition.chain,
        "unit": job.unit,
        "seed": job.seed,
        "file": str(file),
        "genMs": synthesis.gen_ms,
        "promptCodes": codes,
        "junctionSec": None if codes is None else round(decoder_junction_sec(codes), 2),
    }
