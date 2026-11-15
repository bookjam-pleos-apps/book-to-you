"""듣기 파일과 정답표를 저장하고 읽는다. 진입점들이 같은 형식과 같은 안전장치를 쓰게 한다."""
import json
from pathlib import Path

import numpy as np

from spike.sound.atomic import atomic_path
from spike.sound.audio import Audio
from spike.sound.audio_io import read_audio
from spike.sound.audio_level import leveled
from spike.clone.layout import Condition
from spike.listening.listening_plan import PlacedClip, placed_from_key
from spike.clone.reference.ref_prep import prepared_speaker_reference
from spike.render.story_render import RenderedSentence, story_sample_count
from spike.render.story_store import STORY_NAME, save_story

LISTENING_DIR = "listening"
PAIRS_DIR = "pairs"
TRACK_NAME = "listening.wav"
KEY_NAME = "key.json"
REFERENCE_STYLE = "calm"
QUOTE = "“"


def listening_folder(out: Path) -> Path:
    return out / LISTENING_DIR


def pairs_folder(out: Path) -> Path:
    return listening_folder(out) / PAIRS_DIR


def refuse_rebuild(folder: Path) -> None:
    """들은 뒤에 시각과 클립의 대응이 바뀌면 지목 결과를 해석할 수 없다."""
    if (folder / KEY_NAME).exists():
        raise FileExistsError(f"{folder / KEY_NAME}이 이미 있어 듣기 파일을 다시 만들지 않습니다")


def heard_story(out: Path, units: list[RenderedSentence]) -> Audio:
    """재조립하지 않고 실제로 들은 파일에서 자른다. 단위 정보와 파일이 어긋나면 시각 대응이 틀어지므로 멈춘다."""
    story = read_audio(out / STORY_NAME)
    expected = story_sample_count(units)
    if len(story.samples) != expected:
        raise ValueError(f"{STORY_NAME} 길이 {len(story.samples)}가 단위 합계 {expected}와 다릅니다")
    return story


def reference_lead(speaker: str, condition: Condition) -> np.ndarray:
    """듣기 파일 앞에 붙이는 화자의 calm 녹음. 폰 녹음(B)만 있는 화자도 있어 조건을 받는다."""
    prepared = prepared_speaker_reference(speaker, condition, REFERENCE_STYLE)
    return leveled(read_audio(prepared).samples)


def starts_with_quote(unit: RenderedSentence) -> bool:
    return unit.sentence.text.startswith(QUOTE)


def save_listening(folder: Path, track: Audio, key: dict) -> None:
    """정답표를 마지막에 쓴다. 정답표가 있으면 듣기 파일도 온전히 있다는 뜻이 된다."""
    save_story(folder / TRACK_NAME, track)
    with atomic_path(folder / KEY_NAME) as tmp:
        tmp.write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"클립 {len(key['clips'])}개, 길이 {track.duration_sec / 60:.1f}분 → {folder / TRACK_NAME}")


def load_key(folder: Path) -> tuple[dict, list[PlacedClip]]:
    key = json.loads((folder / KEY_NAME).read_text(encoding="utf-8"))
    return key, [placed_from_key(line) for line in key["clips"]]
