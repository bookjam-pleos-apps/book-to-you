"""라벨 파일의 형식 규칙과 문장별 값 계산."""

from guyeon_common import (
    EMOTIONS,
    LABEL_KEYS,
    LIST_KEYS,
    NARRATOR,
    NON_DEFAULT_STYLES,
    STYLES,
    VOICE_TYPES,
    cast_styles,
    draft_hash,
    role_of,
)


def _is_index(value: object, count: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value < count


def _int_indexes(entries: list) -> list[int]:
    return [item["index"] for item in entries if isinstance(item, dict) and isinstance(item.get("index"), int)]


def _entry_problems(entries: list, name: str, count: int, needed: tuple[str, ...]) -> list[str]:
    malformed = [f"{name}: 형식이 잘못됐습니다: {item}" for item in entries if not isinstance(item, dict)]
    if malformed:
        return malformed
    bad_index = [f"{name}: 없는 문장 번호입니다: {item.get('index')}" for item in entries if not _is_index(item.get("index"), count)]
    blank = [
        f"{name} {item.get('index')}번: {key}가 비어 있습니다"
        for item in entries
        for key in needed
        if not (isinstance(item.get(key), str) and item[key].strip())
    ]
    indexes = _int_indexes(entries)
    repeated = [f"{name}: {index}번이 두 번 나옵니다" for index in sorted({i for i in indexes if indexes.count(i) > 1})]
    return [*bad_index, *blank, *repeated]


def _scene_problems(scenes: list, count: int) -> list[str]:
    if not scenes:
        return ["scenes: 장면 지도가 없습니다. 이야기를 장면으로 먼저 나누세요"]
    if not all(isinstance(scene, dict) and isinstance(scene.get("summary"), str) and scene["summary"].strip() for scene in scenes):
        return ["scenes: 장면마다 from, to, summary가 필요합니다"]
    spans = [(scene.get("from"), scene.get("to")) for scene in scenes]
    backwards = [
        f"scenes: {start}~{end} 범위가 잘못됐습니다"
        for start, end in spans
        if not (isinstance(start, int) and isinstance(end, int) and start <= end)
    ]
    if backwards:
        return backwards
    expected = [0, *[end + 1 for _, end in spans[:-1]]]
    gaps = [f"scenes: {start}번에서 시작해야 합니다" for (actual, _), start in zip(spans, expected) if actual != start]
    return gaps or ([] if spans[-1][1] == count - 1 else [f"scenes: 마지막 장면은 {count - 1}번에서 끝나야 합니다"])


def _cast_problems(labels: dict) -> list[str]:
    cast = labels.get("cast", [])
    valid = [
        item for item in cast
        if isinstance(item, dict) and isinstance(item.get("name"), str) and item.get("voiceType") in VOICE_TYPES
        and item.get("style", STYLES[0]) in STYLES
    ]
    if len(valid) != len(cast):
        return [f"cast: 항목마다 name과 voiceType({', '.join(VOICE_TYPES)})이 필요하고, style은 {', '.join(STYLES)} 중 하나입니다"]
    known = {item["name"] for item in cast} | {NARRATOR}
    notes = [item for item in labels.get("annotations", []) if isinstance(item, dict)]
    speakers = {item["speaker"] for item in notes if isinstance(item.get("speaker"), str)}
    return [f"annotations: cast에 없는 화자입니다: {name}" for name in sorted(speakers - known)]


def _cast_style_conflicts(labels: dict) -> list[str]:
    fixed = cast_styles(labels.get("cast", []))
    speakers = {
        item.get("index"): item["speaker"]
        for item in labels.get("annotations", [])
        if isinstance(item, dict) and isinstance(item.get("speaker"), str) and isinstance(item.get("index"), int)
    }
    marked = [(style, item.get("index")) for style in NON_DEFAULT_STYLES for item in labels.get(style, []) if isinstance(item, dict)]
    return [
        f"{style} {index}번: {speakers[index]}의 녹음은 cast에서 {fixed[speakers[index]]}로 정했습니다"
        for style, index in marked
        if isinstance(index, int) and index in speakers and fixed.get(speakers[index], style) != style
    ]


SPOKEN_ROLES = ("dialogue", "mixed")


def _unnamed_dialogue(labels: dict, sentences: list[dict]) -> list[str]:
    """인물 녹음을 정한 이야기에서 화자 없는 대사는 조용히 서술 녹음으로 읽힌다. 대사와 꼬리를 나눈 뒤 7곳에서 실제로 일어났다.

    말하기 꼬리를 이은 문장(“어흥!” 늑대가 말했어요.)은 mixed라서 함께 본다. 꼬리 잇기가 기본이라 가장 흔한 대사 모양이다.
    """
    if not cast_styles(labels.get("cast", [])):
        return []
    named = {item.get("index") for item in labels.get("annotations", []) if isinstance(item, dict)}
    return [
        f"{index}번: 대사인데 화자가 없습니다. 인물 녹음이 적용되도록 annotations에 speaker를 적으세요"
        for index, line in enumerate(sentences)
        if role_of(line["text"]) in SPOKEN_ROLES and index not in named
    ]


def _style_and_note_problems(labels: dict, count: int) -> list[str]:
    notes = labels.get("annotations", [])
    styled = [p for style in NON_DEFAULT_STYLES for p in _entry_problems(labels.get(style, []), style, count, ("reason",))]
    reviews = _entry_problems(labels.get("review", []), "review", count, ("reason",))
    noted = _entry_problems(notes, "annotations", count, ("speaker", "emotion"))
    bad_emotion = [
        f"annotations {item.get('index')}번: 알 수 없는 감정 {item.get('emotion')}"
        for item in notes
        if isinstance(item, dict) and item.get("emotion") not in EMOTIONS
    ]
    both = set(_int_indexes(labels.get("excited", []))) & set(_int_indexes(labels.get("soft", [])))
    clash = [f"{index}번: excited와 soft를 함께 줄 수 없습니다" for index in sorted(both)]
    return [*styled, *reviews, *noted, *bad_emotion, *clash]


def label_problems(labels: dict, sentences: list[dict]) -> list[str]:
    if labels.get("draftHash") != draft_hash(sentences):
        return ["draftHash가 초안과 다릅니다. 문장이 바뀌었으니 make_label_sheet로 다시 만들거나 rebase_labels를 쓰세요"]
    shape = [f"{key}: 목록이어야 합니다" for key in LIST_KEYS if key in labels and not isinstance(labels[key], list)]
    if shape:
        return shape
    unknown = [f"알 수 없는 키입니다: {key}" for key in sorted(set(labels) - LABEL_KEYS)]
    count = len(sentences)
    cast = _cast_problems(labels)
    conflicts = [] if cast else [*_cast_style_conflicts(labels), *_unnamed_dialogue(labels, sentences)]
    return [*unknown, *_style_and_note_problems(labels, count), *cast, *conflicts, *_scene_problems(labels.get("scenes", []), count)]


def label_values(labels: dict, count: int) -> list[dict]:
    excited = {item["index"] for item in labels.get("excited", [])}
    soft = {item["index"] for item in labels.get("soft", [])}
    notes = {item["index"]: item for item in labels.get("annotations", [])}
    fixed = cast_styles(labels.get("cast", []))

    def speaker(index: int) -> str:
        return notes.get(index, {}).get("speaker", NARRATOR)

    return [
        {
            "style": "excited" if index in excited else "soft" if index in soft else fixed.get(speaker(index), "calm"),
            "speaker": speaker(index),
            "emotion": notes.get(index, {}).get("emotion", "neutral"),
        }
        for index in range(count)
    ]
