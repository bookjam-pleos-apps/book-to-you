"""목소리 자동 보정 규칙을 데이터 파일에서 읽는다. 어댑터(파일)."""
import json
from pathlib import Path

from spike.clone.catalog import DATA_DIR
from spike.render.voice.voice_rule import VoiceRule

RULE_FILE = "voice-reroll.json"


def voice_rule_from(raw: dict) -> VoiceRule:
    rule = VoiceRule(
        frozenset(raw["styles"]), float(raw["bottomShare"]), int(raw["minGroup"]), int(raw["maxRerolls"]),
        raw["fallbackStyle"], float(raw["groupFloor"]), float(raw["referenceFloor"]),
    )
    if not 0 < rule.bottom_share < 1 or rule.min_group < 2 or rule.max_rerolls < 0:
        raise ValueError(f"따를 수 없는 목소리 보정 규칙입니다: {raw}")
    if rule.fallback_style in rule.styles:
        raise ValueError(f"대체 녹음이 판정 대상 style과 같습니다: {rule.fallback_style}")
    return rule


def load_voice_rule(data_dir: Path = DATA_DIR) -> VoiceRule:
    return voice_rule_from(json.loads((data_dir / RULE_FILE).read_text(encoding="utf-8")))
