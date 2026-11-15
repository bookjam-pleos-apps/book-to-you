"""render-batch가 배치 하나의 뒤처리(꼬리 자르기, 받아쓰기, QC)를 단계마다 한 번에 하게 하는 shell 단계 본문.

whisper를 단위마다 부르면 배치로 아낀 생성 시간보다 받아쓰기가 더 걸렸다(DGX 로그: 클론 약 200초, 받아쓰기 약 220초).
그래서 배치의 조각을 모두 모아 whisper 호출 한 번에 보내고, 판단은 단위별 단계(run_render_step)를 그대로 부른다.
단계끼리는 상태를 넘기지 않고 시도 파일에서 다시 읽는다. VAD로 나눌 단위와 단위별 구간 수만 이 배치의 목록 파일에 남긴다.
"""
import argparse
import json
from pathlib import Path

from spike.compose import unit_steps
from spike.render.attempt.attempt_files import attempts_dir, tail_clip_audio, tail_clips_pattern
from spike.render.batch.batch_transcripts import flattened, split_back
from spike.compose.unit_steps import read_take


def _no_stdin() -> bytes:
    return b""


def _unit_args(args: argparse.Namespace, unit: int, **extra: str) -> argparse.Namespace:
    return argparse.Namespace(job=args.job, unit=unit, attempt=args.attempt, **extra)


def _units(args: argparse.Namespace) -> list[int]:
    return json.loads(args.units)


def _batch_file(args: argparse.Namespace, kind: str) -> Path:
    """한 시도 번호 안에서 단위는 배치 하나에만 들어가므로 첫 단위 번호로 배치를 가린다."""
    return attempts_dir(args.job) / f"batch-{_units(args)[0]:04d}-a{args.attempt}.{kind}.json"


def _tail_paths(args: argparse.Namespace, unit: int) -> list[str]:
    """save가 쓴 꼬리 조각. 번호 순서가 받아쓰기 순서다(tail_cut.tail_clips)."""
    count = len(list(attempts_dir(args.job).glob(tail_clips_pattern(unit, args.attempt))))
    return [str(tail_clip_audio(args.job, unit, args.attempt, index)) for index in range(count)]


def step_tails(args: argparse.Namespace) -> dict:
    return {"paths": flattened([_tail_paths(args, unit) for unit in _units(args)])}


def step_cut(args: argparse.Namespace) -> dict:
    """--texts는 tails가 낸 순서의 꼬리 받아쓰기다. 30초를 넘어 VAD로 나눌 단위의 음성 경로를 낸다."""
    units = _units(args)
    per_unit = split_back(json.loads(args.texts), [len(_tail_paths(args, unit)) for unit in units])
    cuts = [
        unit_steps.step_cut(_unit_args(args, unit, texts=json.dumps(texts, ensure_ascii=False)), _no_stdin)
        for unit, texts in zip(units, per_unit)
    ]
    long = [(unit, cut["audio_path"]) for unit, cut in zip(units, cuts) if cut["long"]]
    _batch_file(args, "long").write_text(json.dumps([unit for unit, _ in long]), encoding="utf-8")
    return {"long": [path for _, path in long]}


def _segments_of(args: argparse.Namespace, unit: int, vads: dict[int, object]) -> list[str]:
    """자르지 못한 시도는 qc가 받아쓰지 않고 실패로 두므로 구간을 만들지 않는다."""
    if read_take(_unit_args(args, unit)).cut_failed:
        return []
    return unit_steps.step_segments(_unit_args(args, unit, vad=json.dumps(vads.get(unit, []))), _no_stdin)


def step_segments(args: argparse.Namespace) -> dict:
    """--vad는 cut이 낸 긴 단위 순서의 VAD 결과다. 수가 다르면 긴 단위가 구간 없이 남으므로 멈춘다.
    단위별 구간 수를 목록 파일에 남겨 qc가 받아쓰기를 되돌린다."""
    long_units = json.loads(_batch_file(args, "long").read_text(encoding="utf-8"))
    vads = dict(zip(long_units, json.loads(args.vad), strict=True))
    groups = [_segments_of(args, unit, vads) for unit in _units(args)]
    _batch_file(args, "segments").write_text(json.dumps([len(group) for group in groups]), encoding="utf-8")
    return {"paths": flattened(groups)}


def step_qc(args: argparse.Namespace) -> list[dict]:
    counts = json.loads(_batch_file(args, "segments").read_text(encoding="utf-8"))
    per_unit = split_back(json.loads(args.texts), counts)
    return [
        unit_steps.step_qc(_unit_args(args, unit, texts=json.dumps(texts, ensure_ascii=False)), _no_stdin)
        for unit, texts in zip(_units(args), per_unit)
    ]
