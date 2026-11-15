"""원고를 태깅 초안으로 만든다. 사람이 confirmedStyle을 채우면 run_confirm_story로 확정한다.

사용: uv run python -m spike.run_tag_story --body story.txt --id frog --out outputs/drafts/frog.draft.json
Nimble은 --tagger nimble로 쓴다. ssh -L 18092:127.0.0.1:18092 <4090 호스트>로 서비스에 연결해 둔다.
"""
import argparse
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

from spike.clone.budget import count_syllables
from spike.clone.cli_output import print_list
from spike.story.story_document import check_new_draft_path, save_draft
from spike.story.story_draft import DraftSentence, Tagger, build_draft, suggest_by_rule
from spike.story.story_split import body_warnings, split_story
from spike.story.style_decision import draft_style
from spike.compose.style_tag_client import NimbleTagger
from spike.story.style_tag_plan import load_style_schema

LONGEST_SHOWN = 5


def _nimble_tagger() -> Tagger:
    schema = load_style_schema()
    return NimbleTagger(schema, lambda probabilities: draft_style(probabilities, schema.min_confidence))


TAGGERS = {"rule": lambda: suggest_by_rule, "nimble": _nimble_tagger}


def _longest_sentences(draft: Sequence[DraftSentence]) -> list[str]:
    ranked = sorted(draft, key=lambda line: count_syllables(line.text), reverse=True)[:LONGEST_SHOWN]
    return [f"{count_syllables(line.text)}음절: {line.text[:40]}" for line in ranked]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--body", type=Path, required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--tagger", choices=sorted(TAGGERS), default="rule")
    args = parser.parse_args()
    check_new_draft_path(args.out)
    body = args.body.read_text(encoding="utf-8")
    warnings = body_warnings(body)
    if warnings:
        print("\n".join(f"경고: {warning}" for warning in warnings))
    draft = build_draft(split_story(body), TAGGERS[args.tagger]())
    save_draft(args.out, args.id, args.tagger, draft)
    print(f"{len(draft)}문장, 제안: {dict(Counter(line.suggestion.style for line in draft))}")
    print_list("가장 긴 문장 (허용 길이를 넘으면 원고를 고칩니다)", _longest_sentences(draft))


if __name__ == "__main__":
    main()
