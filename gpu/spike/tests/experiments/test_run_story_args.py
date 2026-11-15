import pytest

from spike.experiments.render.run_story_args import parse_story_args

BASE = ["--speaker", "s1b", "--out", "outputs/new"]


def test_saved_plan_with_chain_is_accepted():
    args = parse_story_args(["--plan-from", "outputs/old", "--chain", *BASE])
    assert args.chain and args.body is None


def test_body_keeps_its_unit_options():
    args = parse_story_args(["--body", "story.txt", "--unit", "passage", "--single-style", "calm", *BASE])
    assert (args.unit, args.single_style) == ("passage", "calm")


@pytest.mark.parametrize("option", [["--unit", "passage"], ["--single-style", "calm"]])
def test_saved_plan_refuses_options_it_would_ignore(option, capsys):
    with pytest.raises(SystemExit):
        parse_story_args(["--plan-from", "outputs/old", *option, *BASE])
    assert "함께 쓸 수 없습니다" in capsys.readouterr().err


def test_exactly_one_source_is_required():
    with pytest.raises(SystemExit):
        parse_story_args(BASE)
    with pytest.raises(SystemExit):
        parse_story_args(["--body", "a.txt", "--plan-from", "outputs/old", *BASE])


def test_story_runs_only_experiments_it_can_honor(capsys):
    assert parse_story_args(["--body", "story.txt", "--experiment", "real_quiet_compose", *BASE]).experiment == "real_quiet_compose"

    with pytest.raises(SystemExit):
        parse_story_args(["--body", "story.txt", "--experiment", "streaming_default", *BASE])

    assert "streaming_default" in capsys.readouterr().err


def test_context_source_and_chain_cannot_be_combined():
    with pytest.raises(SystemExit):
        parse_story_args(["--plan-from", "outputs/old", "--chain", "--context-from", "outputs/base", *BASE])


def test_sampling_options_default_to_the_library_values():
    args = parse_story_args(["--plan-from", "outputs/old", *BASE])
    assert (args.repetition_penalty, args.subtalker_greedy, args.context_from) == (None, False, None)


def test_condition_defaults_to_the_wav_recordings():
    assert parse_story_args(["--plan-from", "outputs/old", *BASE]).condition == "A"


def test_phone_recording_is_selected_with_condition_b():
    assert parse_story_args(["--plan-from", "outputs/old", "--condition", "B", *BASE]).condition == "B"


def test_the_tail_follows_the_product_setting_unless_an_experiment_names_one():
    assert parse_story_args(["--plan-from", "outputs/old", *BASE]).tail is None
    assert parse_story_args(["--plan-from", "outputs/old", "--tail", "word", *BASE]).tail == "word"
    with pytest.raises(SystemExit):
        parse_story_args(["--plan-from", "outputs/old", "--tail", "twice", *BASE])
