"""검수를 마친 초안을 확정본으로 만든다. 원고와 다르거나 검수하지 않은 문장이 하나라도 있으면 거부한다.

사용: uv run python -m spike.run_confirm_story --body story.txt --draft outputs/drafts/frog.draft.json --title "개구리 왕자" --out ../../content/stories/frog.json
"""
import argparse
from pathlib import Path

from spike.clone.cli_output import abort_if, print_list
from spike.story.story_document import load_draft, load_draft_cast, load_draft_review, save_confirmed_story
from spike.story.story_draft import confirmation_problems, confirmed_sentences, draft_annotations
from spike.story.story_review_gate import cast_problems, confirmed_review, review_problems
from spike.story.story_split import split_story
from spike.story.story_units import units_at_fixed_boundaries
from spike.story.unit_openings import SHOUT_WARNING, shouting_openings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--body", type=Path, required=True)
    parser.add_argument("--draft", type=Path, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    story_id, draft = load_draft(args.draft)
    slots = split_story(args.body.read_text(encoding="utf-8"))
    record = load_draft_review(args.draft)
    problems = [*confirmation_problems(draft, slots), *cast_problems(draft, load_draft_cast(args.draft)), *review_problems(record)]
    abort_if(problems, "확정할 수 없습니다")
    sentences = confirmed_sentences(draft)
    save_confirmed_story(args.out, story_id, sentences, draft_annotations(draft), args.title, confirmed_review(record))
    print_list(SHOUT_WARNING, shouting_openings(units_at_fixed_boundaries(sentences)))
    print(f"{story_id}: {len(draft)}문장을 확정했습니다 → {args.out}")


if __name__ == "__main__":
    main()
