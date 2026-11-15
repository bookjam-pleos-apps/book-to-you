"""style-tagging 서비스를 태거로 쓴다. 서버는 GPU 장비의 127.0.0.1에 있어 맥에서는 ssh -L로 연결한다."""
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from spike.compose.compose_http import run_workflow
from spike.story.story_draft import Suggestion
from spike.story.story_split import SentenceSlot, curly_quotes
from spike.story.style_tag_plan import STYLE_FIELD, StyleSchema, parse_scores, tagging_text

DEFAULT_URL = "http://127.0.0.1:18092/api/workflows/runs"
WORKFLOW_ID = "style-tagging"


def score_text(url: str, schema: StyleSchema, text: str) -> dict[str, float]:
    payload = run_workflow(url, WORKFLOW_ID, {"text": text, "schema": dict(schema.fields)})
    return parse_scores(payload, schema.fields[STYLE_FIELD]["choices"])


@dataclass(frozen=True)
class NimbleTagger:
    schema: StyleSchema
    decide: Callable[[Mapping[str, float]], str]
    url: str = DEFAULT_URL

    def __call__(self, slots: Sequence[SentenceSlot], index: int) -> Suggestion:
        texts = [curly_quotes(slot.text) for slot in slots]
        probabilities = score_text(self.url, self.schema, tagging_text(texts, index, self.schema.context))
        return Suggestion(self.decide(probabilities), probabilities)
