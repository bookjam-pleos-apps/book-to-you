import json

import pytest

from spike.clone.catalog import (
    instruct_for,
    load_eval_sentences,
    load_reference_scripts,
    load_speakers,
    ordered_for_anchor,
    reference_text,
    script_for,
    select_speakers,
)


def test_every_sentence_style_has_a_reference_script():
    styles = {s.style for s in load_reference_scripts()}
    assert {s.style for s in load_eval_sentences()} <= styles


def test_sentence_ids_are_unique():
    ids = [s.id for s in load_eval_sentences()]
    assert len(ids) == len(set(ids))


def test_ceiling_set_covers_every_sentence_style():
    sentences = load_eval_sentences()
    assert {s.style for s in sentences if s.ceiling} == {s.style for s in sentences}


def test_reference_scripts_do_not_overlap_eval_sentences():
    references = " ".join(s.text for s in load_reference_scripts())
    assert not any(s.text in references for s in load_eval_sentences())


def test_speaker_scripts_name_known_styles_and_real_text():
    known = {s.style for s in load_reference_scripts()}
    own_scripts = [item for speaker in load_speakers() for item in speaker.scripts.items()]
    assert own_scripts
    assert all(style in known and text.strip() for style, text in own_scripts)


def test_speaker_scripts_do_not_overlap_eval_sentences():
    references = " ".join(text for speaker in load_speakers() for text in speaker.scripts.values())
    assert not any(s.text in references for s in load_eval_sentences())


def test_speaker_script_wins_over_the_product_script():
    scripts = load_reference_scripts()
    assert reference_text("soft", scripts, {"soft": "녹음이 읽은 대본"}) == "녹음이 읽은 대본"
    assert reference_text("calm", scripts, {"soft": "녹음이 읽은 대본"}) == script_for("calm", scripts).text


def test_loaded_speakers_stay_hashable_and_their_scripts_cannot_change():
    speakers = load_speakers()
    own = next(s for s in speakers if s.scripts)
    assert len(set(speakers)) == len(speakers)
    with pytest.raises(TypeError):
        own.scripts["soft"] = "다른 대본"


def test_speaker_without_scripts_has_none(tmp_path):
    speaker = {"id": "s9", "source": "recorded", "preset": None, "description": None, "note": ""}
    (tmp_path / "speakers.json").write_text(json.dumps({"speakers": [speaker]}))
    assert dict(load_speakers(tmp_path)[0].scripts) == {}


def test_unknown_field_in_speaker_is_refused(tmp_path):
    speaker = {"id": "s9", "source": "recorded", "preset": None, "description": None, "note": "", "script": {}}
    (tmp_path / "speakers.json").write_text(json.dumps({"speakers": [speaker]}))
    with pytest.raises(TypeError):
        load_speakers(tmp_path)


def test_instruct_for_unknown_style_raises():
    with pytest.raises(KeyError):
        instruct_for("angry", load_reference_scripts())


def test_preset_speakers_name_a_preset():
    assert all(s.preset for s in load_speakers() if s.source == "preset")


def test_design_speakers_have_a_description():
    assert all(s.description for s in load_speakers() if s.source == "design")


def test_speaker_sources_are_known():
    assert {s.source for s in load_speakers()} <= {"preset", "design", "recorded"}


def test_speaker_id_that_could_escape_folder_is_rejected(tmp_path):
    (tmp_path / "speakers.json").write_text(
        '{"speakers": [{"id": "../x", "source": "preset", "preset": "Sohee", "description": null, "note": ""}]}'
    )
    with pytest.raises(ValueError):
        load_speakers(tmp_path)


def test_calm_comes_first_to_become_the_anchor():
    assert ordered_for_anchor(load_reference_scripts())[0].style == "calm"


def test_select_speakers_rejects_unknown_id():
    with pytest.raises(KeyError):
        select_speakers(load_speakers(), ["p_sohee", "p_typo"])


def test_select_speakers_without_ids_leaves_out_recorded_speakers():
    selected = select_speakers(load_speakers(), None)
    assert selected == [s for s in load_speakers() if s.source != "recorded"]
    assert "s1" not in {s.id for s in selected}


def test_recorded_speaker_can_be_selected_by_id():
    assert [s.id for s in select_speakers(load_speakers(), ["s1"])] == ["s1"]


def test_unknown_phonation_is_rejected_when_loading(tmp_path):
    script = {"style": "whisper", "direction": "", "instruct": "", "text": "", "phonation": "unvoice"}
    (tmp_path / "reference-scripts.json").write_text(json.dumps({"scripts": [script]}))
    with pytest.raises(ValueError):
        load_reference_scripts(tmp_path)


def test_whisper_reference_is_expected_to_be_unvoiced():
    assert script_for("whisper", load_reference_scripts()).phonation == "unvoiced"
