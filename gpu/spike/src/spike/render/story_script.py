"""렌더끼리 대응시키기 전에 대본이 같은지 확인한다. 순수 로직."""
from collections.abc import Sequence

from spike.story.story_plan import StorySentence
from spike.render.story_render import RenderedSentence


def refuse_different_script(plan: Sequence[StorySentence], rendered: Sequence[RenderedSentence], label: str) -> None:
    """대본이 다른 렌더를 짝지으면 묶음이 어긋나 비교가 무의미해진다."""
    if [sentence.text for sentence in plan] != [item.sentence.text for item in rendered]:
        raise ValueError(f"{label}의 대본이 계획과 다릅니다")
