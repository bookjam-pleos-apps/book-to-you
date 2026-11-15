"""render-attempt 워크플로우의 단계 본체(spec, save, cut, segments, qc). 진입점은 run_render_step, 배치 단계도 같은 함수를 부른다."""

import argparse
import json
from collections.abc import Callable, Sequence
from dataclasses import asdict, replace
from pathlib import Path

from spike.sound.atomic import atomic_path
from spike.render.attempt.attempt_files import (
    attempt_raw_audio,
    attempt_record_file,
    attempt_take_file,
    attempts_dir,
    clip_audio,
    tail_clip_audio,
    unit_files_pattern,
)
from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.compose.compose_client import decode_pcm16_wav
from spike.sound.ffmpeg_runner import run_ffmpeg
from spike.render.attempt.render_attempts import (
    AttemptSpec,
    Measurement,
    TakeFacts,
    attempt_record,
    attempt_spec,
    measure,
    needs_split_transcription,
    qc_texts,
    record_from_dict,
    record_to_dict,
    unit_outcome,
)
from spike.render.job.render_job import job_units, load_render_job
from spike.story.story_plan import StorySentence
from spike.render.story_store import save_unit_audio
from spike.render.tail.tail_cut import cut_with_transcripts, tail_clips
from spike.render.attempt.vad_clips import clip_args, transcription_plan
from spike.clone.scoring.whisper_window import exceeds_whisper_window

ReadStdin = Callable[[], bytes]
Step = Callable[[argparse.Namespace, ReadStdin], object]


def unit_spec(args: argparse.Namespace) -> AttemptSpec:
    job = load_render_job(args.job)
    return attempt_spec(args.job, job, job_units(job), args.unit, args.attempt)


def _removed(path: Path) -> str:
    path.unlink()
    return path.name


def clear_earlier_attempts(job_dir: Path, unit_index: int) -> list[str]:
    """다시 렌더하는 폴더에서 이전 실행의 시도가 고르기에 섞이지 않게 한다."""
    return [_removed(path) for path in sorted(attempts_dir(job_dir).glob(unit_files_pattern(unit_index)))]


def step_spec(args: argparse.Namespace, _read_stdin: ReadStdin) -> dict:
    spec = unit_spec(args)
    cleared = clear_earlier_attempts(args.job, args.unit) if args.attempt == 0 else []
    return {**asdict(spec), "cleared": cleared}


def _write_take(args: argparse.Namespace, facts: TakeFacts) -> None:
    with atomic_path(attempt_take_file(args.job, args.unit, args.attempt)) as tmp:
        tmp.write_text(json.dumps(asdict(facts)), encoding="utf-8")


def read_take(args: argparse.Namespace) -> TakeFacts:
    return TakeFacts(**json.loads(attempt_take_file(args.job, args.unit, args.attempt).read_text(encoding="utf-8")))


def _unit(args: argparse.Namespace) -> StorySentence:
    return job_units(load_render_job(args.job))[args.unit]


def _saved_clip(path: Path, audio: Audio) -> str:
    save_unit_audio(path, audio)
    return str(path)


def step_save(args: argparse.Namespace, read_stdin: ReadStdin) -> dict:
    """서비스는 길이 미상의 16비트 스트리밍 WAV를 보낸다. 풀어서 받아쓰기 입력과 같은 32비트 부동소수로 저장한다.
    꼬리는 cut이 자른다. 낱말 꼬리면 자를 쉼을 고를 후보 조각도 저장해 워크플로우가 받아쓰게 한다."""
    spec, unit = unit_spec(args), _unit(args)
    audio = decode_pcm16_wav(read_stdin())
    save_unit_audio(attempt_raw_audio(args.job, args.unit, args.attempt), audio)
    clips = tail_clips(unit, audio)
    paths = [_saved_clip(tail_clip_audio(args.job, args.unit, args.attempt, index), clip) for index, clip in enumerate(clips)]
    return {**asdict(measure(spec.text, audio)), "tail_clips": paths}


def step_cut(args: argparse.Namespace, _read_stdin: ReadStdin) -> dict:
    """길이 예산은 자르기 전 생성음과 보낸 글로 재서 남긴다. 자르지 못하면 생성음을 그대로 두고 qc가 받아쓰지 않고 실패로 둔다.
    --texts는 save가 낸 꼬리 조각의 받아쓰기이고 순서가 같다."""
    spec = unit_spec(args)
    audio = read_audio(attempt_raw_audio(args.job, args.unit, args.attempt))
    cut = cut_with_transcripts(_unit(args), audio, [str(text).strip() for text in json.loads(args.texts)])
    saved = audio if cut.audio is None else cut.audio
    save_unit_audio(Path(spec.audio_path), saved)
    take = TakeFacts(measure(spec.text, audio).hit_budget, cut.audio is None, cut.head_share, cut.head_transcript)
    _write_take(args, take)
    return {"cut_failed": take.cut_failed, "audio_path": spec.audio_path, "long": needs_split_transcription(take, exceeds_whisper_window(saved))}


def saved_measurement(args: argparse.Namespace, spec: AttemptSpec) -> Measurement:
    """길이와 30초 판단은 저장한 앞부분으로, 길이 예산은 save가 자르기 전에 잰 값으로 한다."""
    saved = measure(spec.unit_text, read_audio(Path(spec.audio_path)))
    return replace(saved, hit_budget=read_take(args).hit_budget)


def _clip(source: str, span_args: list[str], dst: Path) -> str:
    run_ffmpeg(span_args, dst)
    return str(dst)


def step_segments(args: argparse.Namespace, _read_stdin: ReadStdin) -> list[str]:
    """낱말 꼬리를 자를 때 이미 받아쓴 앞부분은 다시 받아쓰지 않는다(qc가 take의 받아쓰기를 쓴다)."""
    if read_take(args).head_transcript is not None:
        return []
    spec = unit_spec(args)
    measured = saved_measurement(args, spec)
    plan = transcription_plan(measured.hit_budget, measured.is_long, json.loads(args.vad))
    if plan.whole:
        return [spec.audio_path]
    return [
        _clip(spec.audio_path, clip_args(spec.audio_path, span), clip_audio(args.job, args.unit, args.attempt, index))
        for index, span in enumerate(plan.spans)
    ]


def _read_record(job_dir: Path, unit_index: int, attempt: int) -> dict:
    return json.loads(attempt_record_file(job_dir, unit_index, attempt).read_text(encoding="utf-8"))


def step_qc(args: argparse.Namespace, _read_stdin: ReadStdin) -> dict:
    spec = unit_spec(args)
    take = read_take(args)
    texts = qc_texts(take, json.loads(args.texts))
    record = attempt_record(spec, saved_measurement(args, spec), texts, take.head_share)
    with atomic_path(attempt_record_file(args.job, args.unit, args.attempt)) as tmp:
        tmp.write_text(json.dumps(record_to_dict(record), ensure_ascii=False), encoding="utf-8")
    # 목소리 다시 굴리기와 대체 렌더는 시도 번호를 건너뛰므로 있는 기록만 읽는다(render-unit의 반복에서는 빈 번호가 없다).
    made = [attempt for attempt in range(args.attempt + 1) if attempt_record_file(args.job, args.unit, attempt).exists()]
    records = [record_from_dict(_read_record(args.job, args.unit, attempt)) for attempt in made]
    return asdict(unit_outcome(records))


STEPS: dict[str, Step] = {"spec": step_spec, "save": step_save, "cut": step_cut, "segments": step_segments, "qc": step_qc}
