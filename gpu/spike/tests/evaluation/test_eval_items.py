from spike.evaluation.eval_set.eval_items import Listening, Mark, Render, first_per_text, flagged_items, normal_items, with_core_tier
from spike.evaluation.eval_set.eval_set import Unit

# 단위 시작: 0, 2.5, 5.0, 7.5, 10.0, 12.5초 (길이 2초 + 쉼 0.5초)
STORY = Render(
    units=tuple(Unit(text=t, style=s, duration_sec=2.0, pause_after_ms=500)
                for t, s in [("제목", "calm"), ("“와!”", "excited"), ("서술", "calm"), ("“우와!”", "excited"), ("“야호!”", "excited"), ("끝", "calm")]),
    audio=tuple(f"u{i}.wav" for i in range(6)),
)
TEXTS = {(r, i): u.text for r in ("a", "b", "r") for i, u in enumerate(STORY.units)}


def listening(name: str, render: str, *marks: Mark) -> Listening:
    return Listening(id=name, render=render, file=f"{name}.wav", marks=marks)


def test_the_same_unit_flagged_twice_becomes_one_sure_item_named_by_render_and_unit():
    marks = [listening("x", "r", Mark("0:03", "tone_jump", "튐")), listening("q", "r", Mark("0:04", "tone_jump", "튐"))]
    items = flagged_items(marks, {"r": STORY})
    assert [(i.id, i.sure, len(i.observations)) for i in items] == [("r#1", True, 2)]


def test_ids_do_not_depend_on_the_order_of_listenings():
    first = listening("x", "a", Mark("0:10", "tone_jump", "튐"))
    second = listening("y", "b", Mark("0:03", "not_my_voice", "다름"))
    renders = {"a": STORY, "b": STORY}
    build = lambda ls: {(i.id, i.label, i.paired_with) for i in normal_items(with_core_tier(flagged_items(ls, renders), TEXTS), renders, {"a": 1, "b": 1})}
    assert build([first, second]) == build([second, first])


def test_normals_skip_every_flagged_unit_and_inherit_the_tier():
    marks = listening("x", "r", Mark("0:03", "not_my_voice", "다름"), Mark("0:08", "tone_jump", "튐"))
    flagged = with_core_tier(flagged_items([marks], {"r": STORY}), TEXTS)
    normals = normal_items(flagged, {"r": STORY}, {"r": 1})
    # 3번(“우와!”)은 지목돼서 1번의 짝이 될 수 없고, 3번의 짝은 남은 excited 대사가 없어 비운다.
    assert [(n.id, n.kind, n.paired_with, n.tier, n.sure) for n in normals] == [("r#4", None, "r#1", "core", False)]


def test_core_takes_voice_marks_and_the_first_sentence_flagged_in_two_renders():
    renders = {"a": STORY, "b": STORY}
    marks = [
        listening("la", "a", Mark("0:10", "tone_jump", "튐"), Mark("0:05", "tone_jump", "튐")),
        listening("lb", "b", Mark("0:11", "tone_jump", "튐"), Mark("0:03", "not_my_voice", "다름")),
    ]
    items = with_core_tier(flagged_items(marks, renders), TEXTS)
    assert [(i.id, i.tier) for i in items] == [("a#4", "core"), ("a#2", "reserve"), ("b#4", "reserve"), ("b#1", "core")]


def test_first_per_text_keeps_the_earliest_item_of_each_sentence():
    items = flagged_items([listening("x", "a", Mark("0:10", "tone_jump", "튐")), listening("y", "b", Mark("0:10", "tone_jump", "튐"))], {"a": STORY, "b": STORY})
    assert [i.id for i in first_per_text(items, {i.id: "같은 문장" for i in items})] == ["a#4"]


def test_assembly_faults_get_no_normal_and_are_never_core():
    flagged = with_core_tier(flagged_items([listening("x", "r", Mark("0:03", "assembly_volume", "작아짐", strong=True))], {"r": STORY}), TEXTS)
    assert [i.tier for i in flagged] == ["reserve"]
    assert normal_items(flagged, {"r": STORY}, {"r": 2}) == []


def test_marks_on_the_title_are_dropped_like_its_normals():
    items = flagged_items([listening("x", "r", Mark("0:01", "not_my_voice", "다름"), Mark("0:03", "tone_jump", "튐"))], {"r": STORY})
    assert [i.id for i in items] == ["r#1"]


def test_an_assembly_fault_written_first_does_not_hide_a_model_fault():
    marks = [listening("x", "r", Mark("0:03", "assembly_volume", "작아짐")), listening("y", "r", Mark("0:03", "not_my_voice", "다름"))]
    (item,) = with_core_tier(flagged_items(marks, {"r": STORY}), TEXTS)
    assert (item.kind, item.tier) == ("not_my_voice", "core")
