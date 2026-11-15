"""직접 호출과 model-compose 결과를 비교한다. GPU 전용. voice-clone 서비스를 127.0.0.1에 띄운 뒤 실행한다.

실행 환경은 gpu/compose/README.md를 따른다.
"""
import argparse
import json
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from functools import reduce
from pathlib import Path

import soundfile as sf

from spike.sound.atomic import atomic_path
from spike.sound.audio_io import read_audio
from spike.clone.catalog import EvalSentence, load_eval_sentences
from spike.clone.cli_output import abort_if
from spike.clone.engine.clone_port import CloneEngine, CloneRequest
from spike.compose.compose_client import ComposeCloneEngine, ComposeTranscriber, prepare_reference_via_compose
from spike.clone.plan.experiment import Experiment, load_experiments, select
from spike.clone.layout import RECORDINGS_DIR, reference_path
from spike.compose.parity_check import (
    ClipMetrics,
    ParityLimits,
    clip_metrics,
    limit_violations,
    mean_speed_gap,
    parity_passed,
    same_pcm16,
    transcriber_violations,
    unknown_ids,
)
from spike.clone.reference.ref_prep import prepared_speaker_reference
from spike.render.speaker_references import speaker_references
from spike.render.story_render import Reference, Transcribe

CONDITION = "A"
DIRECT_EXPERIMENT = "real_quiet"
REPORT_NAME = "report.json"
LIMITS = ParityLimits()


@dataclass(frozen=True)
class Harness:
    direct: CloneEngine
    compose: CloneEngine
    direct_transcribe: Transcribe
    compose_transcribe: Transcribe


@dataclass(frozen=True)
class SentenceResult:
    report: dict
    direct: ClipMetrics
    compose: ClipMetrics


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speaker", required=True)
    parser.add_argument("--sentences", nargs="+", required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def _reference_prep_matches(speaker: str, style: str, out: Path) -> bool:
    """이전 실행의 파일이 남아 있으면 서비스를 부르지 않고 비교하게 되므로 지우고 시작한다."""
    via_compose = out / f"reference_{style}.wav"
    via_compose.unlink(missing_ok=True)
    prepare_reference_via_compose(reference_path(RECORDINGS_DIR, speaker, CONDITION, style), via_compose)
    return same_pcm16(read_audio(prepared_speaker_reference(speaker, CONDITION, style)), read_audio(via_compose))


def _compare_sentence(harness: Harness, sentence: EvalSentence, request: CloneRequest, out: Path) -> SentenceResult:
    first = harness.direct.synthesize(request).audio
    second = harness.direct.synthesize(request).audio
    composed = harness.compose.synthesize(request).audio
    sf.write(out / f"{sentence.id}_direct.wav", first.samples, first.sample_rate)
    sf.write(out / f"{sentence.id}_compose.wav", composed.samples, composed.sample_rate)
    transcript = harness.direct_transcribe(first)
    direct_metrics = clip_metrics(first, sentence.text, transcript)
    compose_metrics = clip_metrics(composed, sentence.text, harness.direct_transcribe(composed))
    compose_transcript = harness.compose_transcribe(first)
    transcribed_by_compose = clip_metrics(first, sentence.text, compose_transcript)
    report = {
        "id": sentence.id,
        "directDeterministic": same_pcm16(first, second),
        "samplesMatch": same_pcm16(first, composed),
        "transcriberMatches": transcript == compose_transcript,
        "direct": asdict(direct_metrics),
        "compose": asdict(compose_metrics),
        "violations": [
            *limit_violations(direct_metrics, compose_metrics, LIMITS),
            *transcriber_violations(direct_metrics, transcribed_by_compose, LIMITS),
        ],
    }
    return SentenceResult(report, direct_metrics, compose_metrics)


def _harness() -> Harness:
    from spike.clone.engine.clone_engine import QwenCloneEngine
    from spike.clone.scoring.whisper_transcriber import WhisperTranscriber

    return Harness(QwenCloneEngine(), ComposeCloneEngine(), WhisperTranscriber().transcribe, ComposeTranscriber().transcribe)


def _request(sentence: EvalSentence, reference: Reference, experiment: Experiment) -> CloneRequest:
    return CloneRequest(
        sentence.text, reference.path, reference.text, experiment.model, experiment.seed, non_streaming=True, x_vector_only=False,
    )


def _report(reference_matches: Mapping[str, bool], results: Sequence[SentenceResult], planned: int) -> dict:
    """중간 저장본이 합격으로 읽히지 않도록, 모든 문장이 끝나야 passed가 참이 된다."""
    speed_gap = mean_speed_gap([r.direct for r in results], [r.compose for r in results])
    within_limits = parity_passed(reference_matches.values(), [r.report["violations"] for r in results], speed_gap, LIMITS)
    return {
        "planned": planned,
        "completed": len(results),
        "passed": len(results) == planned and within_limits,
        "referencePrepMatches": dict(reference_matches),
        "meanSpeedGap": speed_gap,
        "clips": [r.report for r in results],
    }


def _save_report(out: Path, report: dict) -> None:
    with atomic_path(out / REPORT_NAME) as tmp:
        tmp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def _compare_all(args: argparse.Namespace, sentences: Sequence[EvalSentence]) -> dict:
    """문장마다 리포트를 저장한다. 긴 비교가 뒤에서 죽어도 앞 결과가 남아야 한다."""
    experiment = select(load_experiments(), [DIRECT_EXPERIMENT])[0]
    styles = sorted({sentence.style for sentence in sentences})
    references = speaker_references(args.speaker, CONDITION, styles)
    reference_matches = {style: _reference_prep_matches(args.speaker, style, args.out) for style in styles}
    harness = _harness()

    def advance(results: list[SentenceResult], sentence: EvalSentence) -> list[SentenceResult]:
        request = _request(sentence, references[sentence.style], experiment)
        done = [*results, _compare_sentence(harness, sentence, request, args.out)]
        _save_report(args.out, _report(reference_matches, done, len(sentences)))
        return done

    return _report(reference_matches, reduce(advance, sentences, []), len(sentences))


def main() -> None:
    args = _parse_args()
    catalog = load_eval_sentences()
    abort_if(unknown_ids(args.sentences, [sentence.id for sentence in catalog]), "없는 문장:")
    args.out.mkdir(parents=True, exist_ok=True)
    wanted = set(args.sentences)
    report = _compare_all(args, [sentence for sentence in catalog if sentence.id in wanted])
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
