"""렌더 뒤 경보: 렌더 폴더(report.json, units/*.wav, story.wav)를 재서 report 옆에 alerts.json을 쓴다. 맥 CPU에서 돈다.

경보는 사람이 먼저 들을 곳을 짚을 뿐이다. 합격 판정과 재생성은 하지 않는다.
사용(gpu/spike에서): uv run --group dev --with 'speechbrain>=1.0' --with torchaudio python -m spike.experiments.measure.run_render_alerts \\
    outputs/exp_v6/redhood_1 [--out /tmp/alerts.json]
소리 깨짐(KOMOS)까지: uv run --group dev --with 'speechbrain>=1.0' --with komos --with 'torch<2.9' --with 'torchaudio<2.9' \\
    python -m spike.experiments.measure.run_render_alerts outputs/exp_v6/redhood_1 --komos
"""
import argparse
import json
import time
from dataclasses import replace
from pathlib import Path

from spike.sound.audio_io import read_audio
from spike.evaluation.eval_set.eval_set import Unit
from spike.evaluation.render_eval.render_alert_measure import alert_inputs
from spike.evaluation.render_eval.render_alerts import build_alerts
from spike.render.story_render import RenderedSentence
from spike.render.story_store import load_units, unit_path

ALERTS_NAME = "alerts.json"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("render", type=Path, help="report.json, units/, story.wav가 있는 렌더 폴더")
    parser.add_argument("--out", type=Path, default=None, help=f"기본은 렌더 폴더의 {ALERTS_NAME}")
    parser.add_argument("--komos", action="store_true", help="소리 깨짐 경보(KOMOS)도 잰다. komos 패키지가 필요하다")
    return parser


def as_unit(rendered: RenderedSentence) -> Unit:
    """길이는 report의 반올림 값 대신 단위 wav의 실제 길이를 쓴다(eval_set.unit_start_seconds)."""
    sentence = rendered.sentence
    return Unit(text=sentence.text, style=sentence.style, duration_sec=rendered.audio.duration_sec, pause_after_ms=sentence.pause_after_ms)


def _komos(render: Path, count: int, enabled: bool) -> list[float] | None:
    if not enabled:
        return None
    from spike.clone.scoring.komos_scorer import komos_scores

    return komos_scores([unit_path(render, i) for i in range(count)])


def main() -> None:
    from spike.clone.scoring.speaker_embedding import EcapaEmbedder

    args = _parser().parse_args()
    out = args.out or args.render / ALERTS_NAME
    if out.exists():
        raise SystemExit(f"이미 있는 경보는 덮어쓰지 않습니다: {out}")
    began = time.monotonic()
    rendered = load_units(args.render)
    try:
        inputs = alert_inputs(EcapaEmbedder(device="cpu"), [as_unit(r) for r in rendered], [r.audio for r in rendered],
                              read_audio(args.render / "story.wav"), None)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    inputs = replace(inputs, komos=_komos(args.render, len(rendered), args.komos))
    alerts = {"render": str(args.render), **build_alerts(inputs)}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(alerts, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"목소리 튐 {len(alerts['voiceShift']['units'])}, 창 {len(alerts['voiceShiftWindows']['units'])}, "
          f"깨짐 {len(alerts['breakage'].get('units', [])) if args.komos else '안 잼'} ({time.monotonic() - began:.0f}초) → {out}")


if __name__ == "__main__":
    main()
