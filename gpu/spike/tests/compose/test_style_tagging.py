import json

import pytest

from spike.compose import style_tag_client
from spike.clone.catalog import load_eval_sentences
from spike.story.story_draft import TAGGED_STYLES
from spike.story.story_split import SentenceSlot
from spike.story.style_eval import NIMBLE_CONDITIONS, baselines, nimble_condition
from spike.story.style_metrics import class_score, confusion
from spike.compose.style_tag_client import NimbleTagger
from spike.story.style_tag_plan import ContextWindow, load_style_schema, parse_scores, tagging_text, top_style

TEXTS = ["첫째.", "둘째.", "셋째.", "넷째.", "다섯째."]
SCORES = {"calm": 0.2, "excited": 0.7, "soft": 0.1}


def test_schema_choices_are_the_styles_a_draft_accepts():
    schema = load_style_schema()
    assert tuple(schema.fields["style"]["choices"]) == TAGGED_STYLES
    assert list(schema.fields) == ["style"]


def test_prompt_marks_the_target_and_its_window():
    assert tagging_text(TEXTS, 2, ContextWindow(1, 1, 1000)) == "BEFORE:\n둘째.\n\nTARGET:\n셋째.\n\nAFTER:\n넷째."


def test_prompt_at_the_story_edge_has_no_empty_section():
    assert tagging_text(TEXTS, 0, ContextWindow(3, 0, 1000)) == "TARGET:\n첫째."


def test_prompt_drops_far_context_before_the_target():
    assert "TARGET:\n셋째." in tagging_text(TEXTS, 2, ContextWindow(2, 2, 10))
    assert tagging_text(TEXTS, 2, ContextWindow(2, 2, 1)) == "TARGET:\n셋째."


def test_scores_must_match_the_schema():
    payload = json.dumps({"decision": {"style": "excited"}, "fields": {"style": {"scores": SCORES}}}).encode()
    assert parse_scores(payload, TAGGED_STYLES) == SCORES
    with pytest.raises(ValueError, match="후보"):
        parse_scores(payload, ("calm",))


def test_null_response_is_reported_as_missing_scores():
    with pytest.raises(ValueError, match="점수"):
        parse_scores(b"null", TAGGED_STYLES)


def test_tagger_sends_schema_without_meta_and_keeps_raw_probabilities(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict] = []

    def fake_workflow(url: str, workflow_id: str, workflow_input: dict) -> bytes:
        calls.append({"workflow": workflow_id, **workflow_input})
        return json.dumps({"fields": {"style": {"scores": SCORES}}}).encode()

    monkeypatch.setattr(style_tag_client, "run_workflow", fake_workflow)
    schema = load_style_schema()
    suggestion = NimbleTagger(schema, lambda _: "calm")([SentenceSlot('"와!"', 450)], 0)
    assert (suggestion.style, suggestion.probabilities) == ("calm", SCORES)
    assert calls[0]["workflow"] == "style-tagging"
    assert calls[0]["schema"] == schema.fields
    assert "“와!”" in calls[0]["text"]


def test_precision_is_unknown_when_a_style_is_never_picked():
    score = class_score([("soft", "calm"), ("calm", "calm")], "soft")
    assert (score.recall, score.precision) == (0.0, None)


def test_class_score_counts_each_kind_of_error():
    pairs = [("excited", "excited"), ("excited", "calm"), ("calm", "excited"), ("soft", "excited")]
    score = class_score(pairs, "excited")
    assert (score.true_positive, score.false_positive, score.false_negative) == (1, 2, 1)


def test_confusion_keeps_actual_and_predicted_apart():
    assert confusion([("soft", "calm"), ("soft", "soft")]) == {"soft": {"calm": 1, "soft": 1}}


def test_rule_baseline_shows_the_quote_mismatch_on_the_real_sentences():
    report = baselines(load_eval_sentences())
    assert report["rule_raw"]["scores"]["excited"]["tp"] == 0
    curly = report["rule_curly"]["scores"]
    assert (curly["excited"]["tp"], curly["excited"]["fp"], curly["excited"]["fn"]) == (3, 2, 3)
    assert (curly["soft"]["tp"], curly["soft"]["precision"]) == (0, None)
    assert report["all_calm"]["scores"]["excited"]["recall"] == 0


def test_nimble_condition_reports_before_and_after_the_decision():
    sentences = load_eval_sentences()[:3]
    condition = next(item for item in NIMBLE_CONDITIONS if not item.context and item.normalize_quotes)
    prompts: list[str] = []

    def score(text: str) -> dict[str, float]:
        prompts.append(text)
        return SCORES

    result = nimble_condition(sentences, condition, load_style_schema(), score, lambda _: "calm")
    assert result["raw"]["confusion"]["calm"] == {"excited": 2}
    assert result["decided"]["scores"]["excited"]["fn"] == 1
    assert all("BEFORE" not in prompt for prompt in prompts)


def test_main_condition_matches_the_product_path():
    assert (NIMBLE_CONDITIONS[0].normalize_quotes, NIMBLE_CONDITIONS[0].context) == (True, True)


def test_top_style_picks_the_most_likely():
    assert top_style(SCORES) == "excited"
