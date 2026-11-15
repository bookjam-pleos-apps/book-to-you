"""초안과 확정본 파일. 재실행으로 사람의 검수 결과를 덮어쓰지 않도록 기존 파일은 거부한다."""
import json
from collections.abc import Mapping, Sequence
from pathlib import Path

from spike.sound.atomic import atomic_path
from spike.story.story_draft import DraftSentence, draft_line, parse_draft_line
from spike.story.story_plan import StorySentence, sentence_from_line, sentence_line

FORMAT_VERSION = 1
DRAFT_SUFFIX = ".draft.json"


def _refuse_existing(path: Path) -> None:
    if path.exists():
        raise FileExistsError(f"이미 있는 파일은 덮어쓰지 않습니다: {path}")


def _write_new(path: Path, document: dict) -> None:
    _refuse_existing(path)
    with atomic_path(path) as tmp:
        tmp.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def check_new_draft_path(path: Path) -> None:
    """태거를 부르기 전에 쓴다. Nimble을 전 문장 호출한 뒤에 저장에서 실패하지 않게 한다."""
    if not path.name.endswith(DRAFT_SUFFIX):
        raise ValueError(f"초안 파일 이름은 {DRAFT_SUFFIX}로 끝나야 합니다: {path}")
    _refuse_existing(path)


def save_draft(path: Path, story_id: str, tagger: str, draft: Sequence[DraftSentence]) -> None:
    check_new_draft_path(path)
    lines = [draft_line(index, sentence) for index, sentence in enumerate(draft)]
    _write_new(path, {"version": FORMAT_VERSION, "id": story_id, "tagger": tagger, "sentences": lines})


def load_draft(path: Path) -> tuple[str, list[DraftSentence]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    return document["id"], [parse_draft_line(line) for line in document["sentences"]]


def load_draft_cast(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8")).get("cast", [])


def load_draft_review(path: Path) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")).get("reviewRecord")


def save_confirmed_story(
    path: Path,
    story_id: str,
    sentences: Sequence[StorySentence],
    annotations: Sequence[Mapping[str, str]] = (),
    title: str | None = None,
    review: Mapping[str, object] | None = None,
) -> None:
    """인물과 감정은 렌더 계획에 들어가지 않지만, 참조를 늘릴 때 다시 태깅하지 않도록 확정본에 남긴다."""
    notes = annotations or [{}] * len(sentences)
    lines = [{**sentence_line(item), **note} for item, note in zip(sentences, notes, strict=True)]
    heading = {"version": FORMAT_VERSION, "id": story_id} | ({} if title is None else {"title": title})
    heading |= {} if review is None else {"review": dict(review)}
    _write_new(path, {**heading, "sentences": lines})


def load_confirmed_story(path: Path) -> list[StorySentence]:
    document = json.loads(path.read_text(encoding="utf-8"))
    return [sentence_from_line(line) for line in document["sentences"]]
