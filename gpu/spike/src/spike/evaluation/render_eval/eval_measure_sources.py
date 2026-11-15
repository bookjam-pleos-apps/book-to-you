"""단위 지표 측정의 파일 경계: 참조·추가 렌더 설정, 렌더 report, 참조 녹음 임베딩(m4a는 ffmpeg로 wav)."""
import json
from collections.abc import Mapping
from functools import cache
from pathlib import Path

import numpy as np

from spike.sound.audio_io import read_audio
from spike.evaluation.eval_set.eval_items import Render
from spike.evaluation.render_eval.eval_measure import reference_paths
from spike.sound.ffmpeg_runner import decode_mono_wav
from spike.clone.identity import Embedder
from spike.sound.speech_activity import speech_only


def _json_object(path: Path, field: str) -> dict[str, object]:
    data = json.loads(path.read_text(encoding="utf-8"))
    value = data.get(field) if isinstance(data, dict) else None
    if not isinstance(value, dict):
        raise TypeError(f"{path}: '{field}' 객체가 없다")
    return value


def load_reference_templates(path: Path, root: Path) -> dict[str, str]:
    """참조 이름 → 절대 경로 틀({style} 포함). 설정의 경로는 root 기준이다."""
    entries = _json_object(path, "references")
    bad = [name for name, entry in entries.items() if not (isinstance(entry, dict) and isinstance(entry.get("path"), str))]
    if bad:
        raise ValueError(f"{path}: path가 없는 참조 {bad}")
    return {name: str(root / entry["path"]) for name, entry in entries.items() if isinstance(entry, dict)}


def load_extra_renders(path: Path) -> dict[str, str | None]:
    entries = _json_object(path, "renders")
    bad = [name for name, picks in entries.items() if picks is not None and not isinstance(picks, str)]
    if bad:
        raise ValueError(f"{path}: picks가 문자열이나 null이 아닌 렌더 {bad}")
    return {name: picks if isinstance(picks, str) else None for name, picks in entries.items()}


def _read_json_list(path: Path) -> list[Mapping[str, object]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        raise ValueError(f"{path}: report는 객체 목록이어야 한다")
    return rows


def report_rows(root: Path, render: Render) -> list[Mapping[str, object]]:
    """단위 wav(폴더/units/0000.wav)가 있는 폴더의 report 줄. 골라 쓰기 대응은 load_render가 정한 것을 그대로 따른다."""
    folders = [(root / audio).parent.parent for audio in render.audio]
    reports = {folder: _read_json_list(folder / "report.json") for folder in dict.fromkeys(folders)}
    return [reports[folder][i] for i, folder in enumerate(folders)]


class ReferenceBank:
    """라벨별 참조 녹음 임베딩. 경로마다 한 번만 잰다. m4a는 work_dir에 모노 wav로 바꿔 읽는다."""

    def __init__(self, embedder: Embedder, work_dir: Path, templates: Mapping[str, str]):
        self._embedder = embedder
        self._work_dir = work_dir
        self._templates = templates
        self.embedding = cache(self._embed)

    def _as_wav(self, source: Path) -> Path:
        if source.suffix == ".wav":
            return source
        return decode_mono_wav(source, self._work_dir / f"{source.parent.name}_{source.stem}.wav")

    def _embed(self, path: str) -> np.ndarray:
        return self._embedder.embed(speech_only(read_audio(self._as_wav(Path(path)))))

    def for_style(self, style: str) -> dict[str, np.ndarray]:
        return {name: self.embedding(path) for name, path in reference_paths(self._templates, style).items()}
