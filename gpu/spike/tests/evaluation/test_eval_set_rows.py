import json

import pytest

from spike.evaluation.eval_set.eval_items import Item, Observation, Render
from spike.evaluation.eval_set.eval_set import Unit
from spike.evaluation.eval_set.eval_set_rows import item_from_row, item_row

RENDER = Render(units=(Unit("제목", "calm", 1.0, 900), Unit("“와!”", "excited", 1.234567, 450)), audio=("u0.wav", "u1.wav"))
FLAGGED = Item(
    id="r#1", label="flagged", render="r", unit=1, kind="tone_jump", sure=True, tier="core",
    observations=(Observation(listening="x", mark="0:02", offset_sec=0.0, at_boundary=True, kind="tone_jump", quote="튐", sure=True),),
)


def written(item: Item) -> dict[str, object]:
    return json.loads(json.dumps(item_row(item, RENDER, {"x": "x.wav"}), ensure_ascii=False))


@pytest.mark.parametrize("item", [FLAGGED, Item(id="r#0", label="normal", render="r", unit=0, kind=None, sure=False, paired_with="r#1")])
def test_a_written_row_reads_back_as_the_same_item(item: Item):
    assert item_from_row(written(item)) == item


@pytest.mark.parametrize(("key", "value", "message"), [("label", "odd", "라벨"), ("tier", "top", "층"), ("unit", "1", "정수"), ("kind", "jump", "지목 종류")])
def test_a_hand_edited_row_with_a_wrong_value_is_refused(key: str, value: object, message: str):
    with pytest.raises(ValueError, match=message):
        item_from_row(written(FLAGGED) | {key: value})
