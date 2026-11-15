"""run_clone이 만든 출력을 평가한다. CER(Whisper), 화자 유사도(ECAPA), 말속도를 재고 통과선과 대조한다.

사용: uv run --extra gpu python -m spike.experiments.clone.run_eval [--experiments baseline calm_only] [--speakers p_sohee]
"""
import json
from pathlib import Path

from spike.evaluation.clone_eval.cli_plan import PlannedRun, parse_plan_args, plan_from_args
from spike.clone.plan.clone_plan import CloneJob, stale_outputs
from spike.clone.plan.clone_runner import load_meta
from spike.evaluation.clone_eval.eval_plan import current_evaluations, pending_evaluations
from spike.evaluation.clone_eval.eval_runner import EvalContext, load_baselines, load_eval_meta, load_reference_gates, run_evaluations
from spike.evaluation.clone_eval.eval_summary import summarize_evaluations
from spike.evaluation.clone_eval.evaluator import Scorers, SpeakerBaseline
from spike.clone.reference.identity_gate import Gates
from spike.sound.pitch_tracker import PyinPitchTracker
from spike.clone.scoring.speaker_embedding import EcapaEmbedder
from spike.clone.scoring.whisper_transcriber import WhisperTranscriber


def _warn_stale(stale: list[str]) -> None:
    if not stale:
        return
    print("지금 설정으로 만들지 않은 출력은 평가하지 않습니다 (run_clone으로 다시 생성하세요):", *stale, sep="\n  ")


def _print_ceiling_prosody(baselines: dict[str, SpeakerBaseline]) -> None:
    """운율 지표 자체의 검증. 천장 녹음에서 excited 폭이 calm보다 넓지 않으면 클론 비교도 믿을 수 없다."""
    lines = [
        f"천장 운율 {speaker}: F0 폭(반음) {b.f0_range_by_style} / 세기 폭(dB) {b.energy_spread_by_style}"
        for speaker, b in baselines.items()
    ]
    print(*lines, sep="\n")


def _evaluate(pending: list[CloneJob], run: PlannedRun, clone_meta: dict[str, dict], gates: Gates) -> None:
    """모델 로딩과 천장 녹음 임베딩에 수 분이 걸린다. 평가할 것이 없으면 요약만 다시 보여 준다."""
    if not pending:
        print("새로 평가할 출력이 없습니다.")
        return
    scorers = Scorers(WhisperTranscriber(), EcapaEmbedder(), PyinPitchTracker())
    baselines = load_baselines(run.speaker_ids, run.sentences, run.recordings, gates, scorers)
    _print_ceiling_prosody(baselines)
    done = run_evaluations(pending, EvalContext(scorers, baselines, clone_meta, gates, run.outputs))
    print(f"이번 실행에서 평가: {len(done)}개")


def main() -> None:
    run = plan_from_args(parse_plan_args())
    clone_meta = load_meta(run.outputs)
    _warn_stale(stale_outputs(run.jobs, clone_meta, Path.exists))
    gates = load_reference_gates(run.recordings, run.speaker_ids)
    pending = pending_evaluations(run.jobs, clone_meta, load_eval_meta(run.outputs), gates, Path.exists)
    _evaluate(pending, run, clone_meta, gates)
    summary = summarize_evaluations(current_evaluations(run.jobs, load_eval_meta(run.outputs), gates))
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
