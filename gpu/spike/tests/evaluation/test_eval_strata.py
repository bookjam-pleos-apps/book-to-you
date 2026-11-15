import math

from spike.evaluation.eval_set.eval_items import Item, Observation
from spike.evaluation.eval_set.eval_strata import listening_strata, metric_value, unit_values


def flagged(render: str, unit: int, *marks: tuple[str, str, bool]) -> Item:
    observations = tuple(Observation(listening=li, mark="0:01", offset_sec=0.0, at_boundary=b, kind=k, quote="", sure=False) for li, k, b in marks)
    return Item(id=f"{render}#{unit}", label="flagged", render=render, unit=unit, kind=observations[0].kind, sure=False, observations=observations)


VALUES = {("r", u): float(u) for u in range(6)}


def test_each_listening_compares_its_boundary_marks_with_units_nobody_flagged():
    items = [
        flagged("r", 2, ("x", "tone_jump", True)),
        flagged("r", 3, ("y", "not_my_voice", True)),
        flagged("r", 4, ("x", "tone_jump", False)),
        flagged("r", 5, ("x", "assembly_volume", True)),
    ]
    strata = listening_strata(items, VALUES)
    # 제목(0번)과 어느 청취에서든 지목된 2~5번은 비교 쪽에서 빠진다. 경계 밖·조립 실수 지목은 지목 쪽에 넣지 않는다.
    assert [(s.flagged, s.others) for s in strata] == [((2.0,), (1.0,)), ((3.0,), (1.0,))]


def test_kinds_narrow_only_the_flagged_side():
    items = [flagged("r", 2, ("x", "tone_jump", True)), flagged("r", 3, ("x", "not_my_voice", True))]
    (stratum,) = listening_strata(items, VALUES, frozenset({"not_my_voice"}))
    assert (stratum.flagged, stratum.others) == ((3.0,), (1.0, 4.0, 5.0))


def test_metric_value_follows_a_dotted_path_and_turns_gaps_into_nan():
    row = {"render": "r", "unit": 1, "simHead": {"s4": 0.8}, "cer": None}
    assert metric_value(row, ["simHead", "s4"]) == 0.8
    assert math.isnan(metric_value(row, ["cer"])) and math.isnan(metric_value(row, ["simHead", "s9"]))


def test_higher_is_better_flips_the_sign_so_worse_is_larger():
    rows = [{"render": "r", "unit": 1, "sim": 0.9}, {"render": "r", "unit": 2, "sim": 0.5}]
    assert unit_values(rows, "sim", higher_is_better=True) == {("r", 1): -0.9, ("r", 2): -0.5}
