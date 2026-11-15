"""시험 세트의 입력(청취 기록, 렌더 report.json, 골라 쓰기 picks)을 읽고 버전 파일을 쓴다. 파일 IO 경계다.

경로는 모두 gpu/spike 폴더(root) 기준이다. 실행한 디렉터리에 따라 결과가 바뀌지 않게 root를 인자로 받는다.
"""
import json
import re
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

from spike.sound.audio_io import audio_seconds
from spike.evaluation.eval_set.eval_checks import CHANGE_ANSWERS, MY_VOICE_ANSWERS, ClipAnswer, ClipCheck
from spike.evaluation.eval_set.eval_items import Listening, Mark, Render
from spike.evaluation.eval_set.eval_set import Unit
from spike.evaluation.eval_set.eval_vocab import Kind, is_kind
from spike.listening.mark_time import mark_seconds
from spike.render.trials.unit_pick import picked_folders

OUTPUTS = "outputs"
SET_PATTERN = re.compile(r"eval-set-v(\d+)\.json$")


def _kind(value: str, declared: set[str], where: str) -> Kind:
    if is_kind(value) and value in declared:
        return value
    raise ValueError(f"{where}: 모르는 지목 종류 {value!r}. eval-listenings.json의 kinds와 spike.evaluation.eval_set.eval_vocab.Kind에 모두 있어야 한다")


def _listening(raw: dict, declared: set[str]) -> Listening:
    marks = tuple(
        Mark(at=m["at"], kind=_kind(m["kind"], declared, f"{raw['id']} {m['at']}"), quote=m["quote"], strong=m.get("strong", False))
        for m in raw["marks"]
    )
    return Listening(id=raw["id"], render=raw["render"], file=raw["file"], marks=marks)


def load_listenings(path: Path) -> tuple[list[Listening], dict[str, str]]:
    """청취 목록과, 골라 쓴 렌더의 picks 파일 위치(render → picks 경로)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    declared = set(data["kinds"])
    return [_listening(r, declared) for r in data["listenings"]], {r["render"]: r["picks"] for r in data["listenings"] if "picks" in r}


def _answer(raw: dict, where: str) -> ClipAnswer:
    if raw["myVoice"] not in MY_VOICE_ANSWERS or raw["reverbChange"] not in CHANGE_ANSWERS:
        raise ValueError(f"{where} 클립 {raw.get('clip')}: 답은 내 목소리 {MY_VOICE_ANSWERS}, 울림 바뀜 {CHANGE_ANSWERS} 중 하나여야 한다")
    mark = None if raw["mark"] == "x" else mark_seconds(raw["mark"])
    return ClipAnswer(clip=raw["clip"], render=raw["render"], unit=raw["unit"], unit_start_sec=raw["unitStartInClip"],
                      mark_sec=mark, my_voice=raw["myVoice"], reverb_change=raw["reverbChange"])


def load_clip_checks(path: Path) -> list[ClipCheck]:
    """eval-listenings.json의 clipChecks(확인 청취). 없으면 빈 목록이다."""
    raw = json.loads(path.read_text(encoding="utf-8")).get("clipChecks", [])
    return [ClipCheck(id=c["id"], file=c["file"], answers=tuple(_answer(a, c["id"]) for a in c["clips"])) for c in raw]


def _units(folder: Path) -> list[Unit]:
    """길이는 report의 반올림 값 대신 단위 wav의 실제 길이를 쓴다."""
    rows = json.loads((folder / "report.json").read_text(encoding="utf-8"))
    return [Unit(text=r["text"], style=r["style"], duration_sec=audio_seconds(_unit_wav(folder, i)), pause_after_ms=r["pauseAfterMs"]) for i, r in enumerate(rows)]


def _unit_wav(folder: Path, index: int) -> Path:
    return folder / "units" / f"{index:04d}.wav"


def load_render(root: Path, render: str, picks_file: str | None) -> Render:
    """골라 쓴 렌더는 단위마다 고른 후보 폴더의 report 줄과 단위 wav를 쓴다. picks의 폴더 경로는 root 기준이다."""
    if picks_file is None:
        folder = root / OUTPUTS / render
        units = _units(folder)
        return Render(units=tuple(units), audio=tuple(_relative(root, _unit_wav(folder, i)) for i in range(len(units))))
    picked = json.loads((root / OUTPUTS / picks_file).read_text(encoding="utf-8"))
    folders = [root / f for f in picked_folders(picked)]
    candidates = [_units(f) for f in folders]
    picks = picked["picks"]
    check_picks(picks, [len(c) for c in candidates], picks_file)
    return Render(units=tuple(candidates[p][i] for i, p in enumerate(picks)), audio=tuple(_relative(root, _unit_wav(folders[p], i)) for i, p in enumerate(picks)))


def check_picks(picks: Sequence[int], candidate_lengths: Sequence[int], where: str) -> None:
    """후보마다 단위 수가 같고 picks가 단위마다 하나씩 후보를 가리켜야 한다. 어긋나면 단위가 조용히 빠지거나 엉뚱하게 섞인다."""
    if set(candidate_lengths) != {len(picks)}:
        raise ValueError(f"{where}: picks {len(picks)}개와 후보 단위 수 {list(candidate_lengths)}가 맞지 않는다")
    if not all(0 <= p < len(candidate_lengths) for p in picks):
        raise ValueError(f"{where}: 후보 폴더 {len(candidate_lengths)}개 밖을 가리키는 pick이 있다")


def _relative(root: Path, path: Path) -> str:
    return str(path.resolve().relative_to(root.resolve()))


def listen_counts(listenings: Sequence[Listening]) -> dict[str, int]:
    return dict(Counter(li.render for li in listenings))


def latest_set(data: Path) -> tuple[int, Path | None]:
    """가장 높은 버전 번호와 그 파일. 아직 없으면 (0, None)."""
    versions = {int(m.group(1)): p for p in data.glob("eval-set-v*.json") if (m := SET_PATTERN.search(p.name))}
    if not versions:
        return 0, None
    top = max(versions)
    return top, versions[top]


def set_path(data: Path, version: int) -> Path:
    return data / f"eval-set-v{version}.json"


def read_set_rows(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["items"]


def write_new_set(path: Path, version: int, rows: list[dict], note: str) -> None:
    """버전 파일은 한 번만 쓴다. 이미 있으면 FileExistsError로 멈춘다."""
    body = json.dumps({"version": version, "note": note, "items": rows}, ensure_ascii=False, indent=1) + "\n"
    with path.open("x", encoding="utf-8") as out:
        out.write(body)
