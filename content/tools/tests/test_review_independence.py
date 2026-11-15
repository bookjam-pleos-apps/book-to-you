"""재검토와 판정이 첫 결과에 기대지 않았는지 확인하는 장치. 스크립트를 실제로 돌린다."""

import json
import subprocess
import unittest
from pathlib import Path

from helpers import Base, sentences
from compare_labels import copy_signals
from verdict_rules import HUMAN, reconciled

OTHER = {"A": "B", "B": "A"}
SOURCE = "가자. 싫어. 토토가 웃었다.\n"
FIRST = "“가자.” “싫어.” 토토가 웃었다.\n"
REVIEW = "“가자. 싫어.” “토토가 웃었다.”\n"
LINES = sentences("“가자.” “싫어.”", "토토가 웃었다.")


class LabelIndependence(Base):
    def _read(self, path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    def _compare(self, first: dict, review: dict) -> tuple[subprocess.CompletedProcess, Path, Path, Path, Path]:
        draft, _, _ = self._flow()
        a, b = self.write_json("a.json", first), self.write_json("b.json", review)
        folder = self.dir / "judge"
        return self.run_script("compare_labels.py", draft, a, b, folder), draft, a, b, folder

    def _verdicts(self, name: str, items: list[dict], key: dict[str, str], pick_review: bool) -> Path:
        chosen = [{"id": item["id"], "verdict": OTHER[key[item["id"]]] if pick_review else key[item["id"]], "reason": name} for item in items]
        return self.write_json(f"{name}.json", {"items": chosen})

    def test_identical_review_in_another_order_is_refused(self) -> None:
        _, first, _ = self._flow()
        reordered = {**{key: first[key] for key in reversed(list(first))}, "excited": list(reversed(first["excited"]))}
        result, *_, folder = self._compare(first, reordered)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("검토 라벨이 첫 라벨과 같습니다", result.stderr)
        self.assertFalse((folder / "labels.judge.json").exists())

    def test_no_disagreement_with_the_same_reasons_is_refused(self) -> None:
        _, first, _ = self._flow()
        renamed_scene = {**first, "scenes": [{"from": 0, "to": 2, "summary": "다른 요약"}]}
        result = self._compare(first, renamed_scene)[0]
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("검토 라벨이 첫 라벨과 같습니다", result.stderr)

    def test_no_disagreement_with_different_reasons_only_warns(self) -> None:
        _, first, _ = self._flow()
        result = self._compare(first, {**first, "excited": [{"index": 0, "reason": "외침"}]})[0]
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("경고: 불일치가 0건입니다", result.stdout)

    def test_swapped_judge_file_shows_every_item_the_other_way(self) -> None:
        _, first, review = self._flow()
        result, *_, folder = self._compare(first, review)
        self.assertEqual(result.returncode, 0, result.stderr)
        shown = self._read(folder / "labels.judge.json")["items"]
        flipped = self._read(folder / "labels.judge.swapped.json")["items"]
        key = self._read(folder / "private" / "labels.key.json")
        self.assertTrue(shown)
        self.assertEqual([(item["A"], item["B"]) for item in flipped], [(item["B"], item["A"]) for item in shown])
        self.assertEqual(key["swappedFirstSide"], {item: OTHER[side] for item, side in key["firstSide"].items()})

    def _apply_both(self, second_picks_review: bool) -> tuple[subprocess.CompletedProcess, Path]:
        _, first, review = self._flow()
        _, draft, a, b, folder = self._compare(first, review)
        items = self._read(folder / "labels.judge.json")["items"]
        key = self._read(folder / "private" / "labels.key.json")
        one = self._verdicts("one", items, key["firstSide"], pick_review=True)
        two = self._verdicts("two", items, key["swappedFirstSide"], pick_review=second_picks_review)
        out = self.dir / "final.json"
        return self.run_script("apply_verdicts.py", draft, a, b, folder, one, out, "--swapped", two), out

    def test_judges_that_pick_different_sides_send_every_item_to_a_person(self) -> None:
        result, out = self._apply_both(second_picks_review=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        decisions = self._read(out)["decisions"]
        self.assertEqual(len(decisions), len(self._read(self.dir / "judge" / "labels.judge.json")["items"]))
        self.assertTrue(all(item["reason"].startswith("두 판정이 엇갈림") for item in decisions))

    def test_judges_that_agree_through_the_swap_leave_no_decisions(self) -> None:
        result, out = self._apply_both(second_picks_review=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self._read(out)["decisions"], [])

    def test_second_verdicts_are_checked_like_the_first(self) -> None:
        _, first, review = self._flow()
        _, draft, a, b, folder = self._compare(first, review)
        items = self._read(folder / "labels.judge.json")["items"]
        one = self._verdicts("one", items, self._read(folder / "private" / "labels.key.json")["firstSide"], pick_review=True)
        two = self.write_json("two.json", {"items": []})
        result = self.run_script("apply_verdicts.py", draft, a, b, folder, one, self.dir / "f.json", "--swapped", two)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("판정이 없습니다", result.stderr)


class RestoreVerdicts(Base):
    def _judged(self) -> tuple[Path, Path, dict[str, str]]:
        source, first, review = (self.write_text(name, text) for name, text in (("s.txt", SOURCE), ("a.txt", FIRST), ("b.txt", REVIEW)))
        drafts = [self.write_json(name, {"sentences": LINES}) for name in ("a.draft.json", "b.draft.json")]
        folder = self.dir / "judge"
        result = self.run_script("compare_restore.py", source, first, review, *drafts, folder)
        self.assertEqual(result.returncode, 0, result.stderr)
        items = json.loads((folder / "restore.judge.json").read_text(encoding="utf-8"))["items"]
        side = json.loads((folder / "private" / "restore.key.json").read_text(encoding="utf-8"))["firstSide"]
        self.assertEqual(sorted(item["kind"] for item in items), ["대사 범위", "대사 쌍의 경계"])
        picks = [{"id": i["id"], "verdict": OTHER[side[i["id"]]] if i["kind"] == "대사 쌍의 경계" else side[i["id"]], "reason": "r"} for i in items]
        return folder, self.write_json("v.json", {"items": picks}), side

    def _verify(self, fixed: str) -> subprocess.CompletedProcess:
        folder, verdicts, _ = self._judged()
        text, draft = self.write_text("fixed.txt", fixed), self.write_json("fixed.draft.json", {"sentences": LINES})
        return self.run_script("apply_restore_verdicts.py", folder, verdicts, "--verify", text, draft)

    def test_lists_items_to_fix_and_refuses_a_changed_review_file(self) -> None:
        folder, verdicts, _ = self._judged()
        listed = self.run_script("apply_restore_verdicts.py", folder, verdicts)
        self.assertEqual(listed.returncode, 0, listed.stderr)
        self.assertIn("검토 쪽으로 고칠 항목 1개", listed.stdout)
        self.write_text("b.txt", REVIEW + "\n")
        refused = self.run_script("apply_restore_verdicts.py", folder, verdicts)
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("검토 복원본이 바뀌었거나 없습니다", refused.stderr)

    def test_verify_passes_when_only_review_picks_are_fixed(self) -> None:
        result = self._verify("“가자. 싫어.” 토토가 웃었다.\n")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_verify_refuses_an_unfixed_copy(self) -> None:
        result = self._verify(FIRST)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("검토 쪽을 골랐는데 아직 차이로 남아 있습니다", result.stderr)

    def test_verify_refuses_fixing_a_first_pick(self) -> None:
        result = self._verify(REVIEW)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("차이가 사라졌습니다", result.stderr)


class Reconcile(unittest.TestCase):
    def test_a_person_asked_for_by_either_judge_stays_with_a_person(self) -> None:
        first = {"1:style": {"verdict": "A", "reason": "첫"}}
        second = {"1:style": {"verdict": HUMAN, "reason": "못 가림"}}
        merged = reconciled(first, second, {"1:style": "A"}, {"1:style": "B"})
        self.assertEqual(merged["1:style"]["verdict"], HUMAN)


class CopySignals(unittest.TestCase):
    def test_identical_labels_without_reasons_only_warn(self) -> None:
        labels = {"excited": [{"index": 0}], "soft": []}
        self.assertEqual(copy_signals(labels, dict(labels), []), (False, True))

    def test_identical_labels_with_reasons_are_a_copy(self) -> None:
        labels = {"excited": [{"index": 0, "reason": "외침"}]}
        self.assertEqual(copy_signals(labels, dict(labels), []), (True, False))


if __name__ == "__main__":
    unittest.main()
