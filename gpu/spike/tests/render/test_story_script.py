import pytest
from fakes import rendered_passage

from spike.story.story_plan import StorySentence
from spike.render.story_script import refuse_different_script


def test_same_script_is_accepted():
    refuse_different_script([StorySentence("같은 대본", "calm", 900)], [rendered_passage("같은 대본")], "문맥 렌더")


def test_different_script_names_the_render_that_differs():
    plan = [StorySentence("계획 대본", "calm", 900)]
    with pytest.raises(ValueError, match="기준 렌더의 대본이 계획과 다릅니다"):
        refuse_different_script(plan, [rendered_passage("다른 대본")], "기준 렌더")


def test_missing_units_are_a_different_script():
    plan = [StorySentence("계획 대본", "calm", 900)]
    with pytest.raises(ValueError):
        refuse_different_script(plan, [], "문맥 렌더")
