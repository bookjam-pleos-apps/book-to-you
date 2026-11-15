"""스크립트가 함께 쓰는 상수, 파일 쓰기, 초안과 라벨 규칙. 표준 라이브러리만 쓴다."""

import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

# deep(낮고 굵은 목소리)과 child(아이 목소리)는 늑대·빨간 모자처럼 목소리 유형이 정해진 인물에게
# cast.style로만 준다.
# 그래서 문장 라벨(SENTENCE_STYLES)과 문장 목록 키(NON_DEFAULT_STYLES, LIST_KEYS)에는 넣지 않는다.
STYLES = ("calm", "excited", "soft", "deep", "child")
NON_DEFAULT_STYLES = ("excited", "soft")
SENTENCE_STYLES = ("calm", *NON_DEFAULT_STYLES)
EMOTIONS = ("neutral", "joy", "anger", "sadness", "fear", "surprise", "tension")
VOICE_TYPES = ("할아버지", "할머니", "아빠", "엄마", "오빠", "언니", "아기")
NARRATOR = "narrator"
LIST_KEYS = ("cast", "scenes", "excited", "soft", "annotations", "review", "decisions", "judged", "relabel")
LABEL_KEYS = {"draftHash", "plantedForTest", *LIST_KEYS}
# 렌더 때 다른 녹음으로 읽는 style. soft는 측정을 통과해 soft 녹음으로 읽으므로 비웠다.
# soft와 calm의 선택이 이제 소리를 바꾸므로 판정표에서 묻는다.
RENDERED_AS: dict[str, str] = {}
SPOKEN_MARKS = ("“", "‘")
HANGUL = re.compile("[가-힣]")
PARAGRAPH_GAP = re.compile(r"\n\s*\n")
SINGLE_BREAK = re.compile(r"(?<=\S)[ \t]*\n[ \t]*(?=\S)")


def arguments(count: int, usage: str) -> list[str]:
    if len(sys.argv) != count + 1:
        raise SystemExit(f"사용: {usage}")
    return sys.argv[1:]


def read_json(path: Path) -> dict:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"읽을 수 없습니다: {path}: {error}") from error
    if not isinstance(document, dict):
        raise SystemExit(f"JSON 객체가 아닙니다: {path}")
    return document


def write_text_atomic(path: Path, text: str) -> None:
    """mkstemp의 600 권한이 남으면 다른 도구가 읽지 못한다. 실패하면 임시 파일을 남기지 않는다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def write_json_atomic(path: Path, document: object) -> None:
    write_text_atomic(path, json.dumps(document, ensure_ascii=False, indent=1) + "\n")


def refuse_existing(path: Path) -> None:
    if path.exists():
        raise SystemExit(f"기존 파일은 덮어쓰지 않습니다: {path}")


def abort_on(problems: list[str]) -> None:
    if problems:
        raise SystemExit("\n".join(problems))


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def draft_hash(sentences: list[dict]) -> str:
    """문장이 하나라도 바뀌면 달라진다. 라벨이 다른 분할에 조용히 붙는 것을 막는다."""
    material = json.dumps([[line["text"], line["pauseMs"]] for line in sentences], ensure_ascii=False)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def syllables(text: str) -> int:
    return len(HANGUL.findall(text))


def role_of(text: str) -> str:
    if not any(mark in text for mark in SPOKEN_MARKS):
        return "narration"
    return "dialogue" if text[0] in SPOKEN_MARKS and text[-1] in "”’" else "mixed"


def cast_styles(cast: list) -> dict[str, str]:
    """인물마다 녹음을 하나로 정한다. 대사마다 녹음을 바꾸면 같은 인물이 다른 사람처럼 들린다(청취로 확인)."""
    return {item["name"]: item["style"] for item in cast if isinstance(item, dict) and "style" in item}


def audible(style: str) -> str:
    return RENDERED_AS.get(style, style)


def changes_sound(decision: dict) -> bool:
    return decision["field"] == "style" and audible(decision["first"]) != audible(decision["review"])


def blinded(items: list[dict], seed: str) -> tuple[list[dict], dict[str, str]]:
    """판정자가 첫 결과를 알아채지 못하도록 항목마다 A, B의 자리를 정한다. 돌려주는 값은 항목별 첫 결과의 자리다."""

    def flipped(item: dict) -> bool:
        return hashlib.sha256(f"{seed}:{item['id']}".encode()).digest()[0] % 2 == 1

    def shown(item: dict) -> dict:
        rest = {key: value for key, value in item.items() if key not in ("first", "review")}
        return {**rest, "A": item["review" if flipped(item) else "first"], "B": item["first" if flipped(item) else "review"]}

    return [shown(item) for item in items], {item["id"]: ("B" if flipped(item) else "A") for item in items}


def swapped(shown: list[dict]) -> list[dict]:
    """두 번째 판정자는 모든 항목의 A, B를 반대로 본다. 자리가 판정을 정했다면 두 판정이 엇갈린다."""
    return [{**item, "A": item["B"], "B": item["A"]} for item in shown]


def other_sides(key: dict[str, str]) -> dict[str, str]:
    return {item: "B" if side == "A" else "A" for item, side in key.items()}


def split_option(args: list[str], flag: str, count: int) -> tuple[list[str], list[str] | None]:
    if flag not in args:
        return args, None
    at = args.index(flag)
    values = args[at + 1 : at + 1 + count]
    if len(values) != count or any(value.startswith("--") for value in values):
        raise SystemExit(f"{flag} 뒤에 값 {count}개가 필요합니다")
    return [*args[:at], *args[at + 1 + count :]], values
