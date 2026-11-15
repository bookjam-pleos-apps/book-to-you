"""스크립트를 실제로 돌리는 흐름 시험. 사용: python3 -m unittest discover -s <skill>/tests"""

import json
import unicodedata
import unittest
from pathlib import Path

from helpers import Base, sentences

from guyeon_common import syllables
from label_rules import label_values


class Flow(Base):
    def test_manuscript_is_unwrapped_and_risks_are_reported(self) -> None:
        raw = self.write_text("raw.txt", "﻿가나 3.5리를\r\n달렸다. 엄마's 집.\r\n\r\n둘째 문단.\r\n")
        out = self.dir / "s.txt"
        result = self.run_script("prepare_manuscript.py", raw, out)
        self.assertEqual(out.read_text(encoding="utf-8"), "가나 3.5리를 달렸다. 엄마's 집.\n\n둘째 문단.\n")
        self.assertIn("3.5리를", result.stdout)
        self.assertIn("곧은따옴표", result.stdout)

    def test_decomposed_hangul_is_composed_so_syllables_count(self) -> None:
        raw = self.write_text("raw.txt", unicodedata.normalize("NFD", "옛날 토끼가 살았어요.\n"))
        out = self.dir / "s.txt"
        self.assertEqual(self.run_script("prepare_manuscript.py", raw, out).returncode, 0)
        self.assertEqual(syllables(out.read_text(encoding="utf-8")), 9)

    def _judged(self, first: dict, review: dict, draft: Path) -> tuple[Path, Path, Path, list[dict], dict]:
        a, b = self.write_json("a.json", first), self.write_json("b.json", review)
        folder = self.dir / "judge"
        self.assertEqual(self.run_script("compare_labels.py", draft, a, b, folder).returncode, 0)
        items = json.loads((folder / "labels.judge.json").read_text(encoding="utf-8"))["items"]
        key = json.loads((folder / "private" / "labels.key.json").read_text(encoding="utf-8"))["firstSide"]
        return a, b, folder, items, key

    def test_judge_file_hides_which_side_is_first(self) -> None:
        draft, first, review = self._flow()
        _, _, folder, items, _ = self._judged(first, review, draft)
        self.assertTrue(items)
        self.assertTrue(all("first" not in item and "review" not in item for item in items))
        self.assertFalse((folder / "labels.key.json").exists())

    def test_verdict_picks_the_value_of_the_chosen_side(self) -> None:
        draft, first, review = self._flow()
        a, b, folder, items, key = self._judged(first, review, draft)
        other = {"A": "B", "B": "A"}
        verdicts = self.write_json(
            "v.json",
            {
                "items": [
                    {"id": item["id"], "verdict": other[key[item["id"]]] if item["id"] == "1:style" else key[item["id"]], "reason": "이유"}
                    for item in items
                ]
            },
        )
        final = self.dir / "final.json"
        result = self.run_script("apply_verdicts.py", draft, a, b, folder, verdicts, final)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        values = label_values(json.loads(final.read_text(encoding="utf-8")), 3)
        self.assertEqual(values[1]["style"], "excited")
        self.assertEqual(values[0]["speaker"], "토토")

    def test_verdicts_refuse_swapped_or_edited_labels(self) -> None:
        draft, first, review = self._flow()
        a, b, folder, items, _ = self._judged(first, review, draft)
        verdicts = self.write_json("v.json", {"items": [{"id": item["id"], "verdict": "A", "reason": "이유"} for item in items]})
        self.assertNotEqual(self.run_script("apply_verdicts.py", draft, b, a, folder, verdicts, self.dir / "x.json").returncode, 0)
        self.write_json("a.json", {**first, "excited": []})
        self.assertNotEqual(self.run_script("apply_verdicts.py", draft, a, b, folder, verdicts, self.dir / "x.json").returncode, 0)

    def test_compare_refuses_to_reuse_a_judge_folder(self) -> None:
        draft, first, review = self._flow()
        a, b, folder, _, _ = self._judged(first, review, draft)
        self.assertNotEqual(self.run_script("compare_labels.py", draft, a, b, folder).returncode, 0)

    def _merged_with_a_human_decision(self) -> Path:
        draft, first, review = self._flow()
        a, b, folder, items, key = self._judged(first, review, draft)
        chosen = [
            {"id": item["id"], "verdict": "사람" if item["field"] == "style" else key[item["id"]], "reason": "이유"} for item in items
        ]
        final = self.dir / "final.json"
        result = self.run_script("apply_verdicts.py", draft, a, b, folder, self.write_json("v.json", {"items": chosen}), final)
        self.assertEqual(result.returncode, 0)
        merged = self.dir / "m.draft.json"
        self.assertEqual(self.run_script("apply_labels.py", draft, final, merged).returncode, 0)
        return merged

    def test_human_decision_must_be_answered_and_is_recorded(self) -> None:
        merged = self._merged_with_a_human_decision()
        out, answers = self.dir / "r.draft.json", self.answer_all(merged)
        self.assertNotEqual(self.run_script("finalize_draft.py", merged, out, "--reviewer", "운영", "--answers", answers).returncode, 0)
        done = self.run_script("finalize_draft.py", merged, out, "--reviewer", "운영", "--answers", answers, "--set", "1=excited")
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        reviewed = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual([line["confirmedStyle"] for line in reviewed["sentences"]], ["excited", "excited", "calm"])
        self.assertEqual(reviewed["reviewRecord"]["overrides"], {"1": "excited"})
        notes = json.loads((self.dir / "t.annotations.json").read_text(encoding="utf-8"))
        self.assertEqual(notes["cast"][0]["name"], "토토")
        self.assertEqual(sorted(notes["sentences"][0]), ["index", "role", "text"])
        again = self.run_script("finalize_draft.py", out, self.dir / "r2.draft.json", "--reviewer", "운영", "--answers", answers)
        self.assertNotEqual(again.returncode, 0)

    def test_finalize_refuses_bad_overrides(self) -> None:
        draft, first, _ = self._flow()
        merged = self.dir / "m.draft.json"
        self.assertEqual(self.run_script("apply_labels.py", draft, self.write_json("a.json", first), merged).returncode, 0)
        answers = self.answer_all(merged)
        for bad in (("--set", "2-1=calm"), ("--set", "1=calm", "--set", "1=soft"), ("--set", "9=calm"), ("--set", "1=whisper")):
            self.assertNotEqual(
                self.run_script("finalize_draft.py", merged, self.dir / "r.draft.json", "--reviewer", "운영", "--answers", answers, *bad).returncode, 0, bad
            )
        self.assertFalse((self.dir / "r.draft.json").exists())

    def test_candidates_keep_unanswered_decisions_above_the_limit(self) -> None:
        lines = [
            {**line, "role": "narration", "speaker": "narrator", "emotion": "neutral"}
            for line in sentences(*[f"문장 {i}." for i in range(12)])
        ]
        decisions = [{"index": i, "field": "style", "text": "x", "first": "calm", "review": "excited", "reason": "r"} for i in range(5)]
        path = self.write_json(
            "m.draft.json", {"id": "t", "tagger": "guyeon-skill", "draftHash": "x", "sentences": lines, "decisions": decisions}
        )
        self.assertEqual(self.run_script("decision_candidates.py", path, self.dir / "c.json", 3).returncode, 0)
        rows = json.loads((self.dir / "c.json").read_text(encoding="utf-8"))["rows"]
        self.assertEqual(sum(row["kind"] == "판정자가 못 가림" for row in rows), 5)

    def test_planted_labels_cannot_reach_a_draft(self) -> None:
        draft, first, _ = self._flow()
        planted = self.dir / "p.json"
        self.assertEqual(
            self.run_script("plant_errors.py", draft, self.write_json("a.json", first), 1, planted, self.dir / "l.json").returncode, 0
        )
        self.assertNotEqual(self.run_script("apply_labels.py", draft, planted, self.dir / "x.draft.json").returncode, 0)

    def test_existing_outputs_are_not_overwritten(self) -> None:
        draft, first, _ = self._flow()
        taken = self.write_text("taken.draft.json", "그대로")
        result = self.run_script("apply_labels.py", draft, self.write_json("a.json", first), taken)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(taken.read_text(encoding="utf-8"), "그대로")

    def test_stale_labels_cannot_be_applied(self) -> None:
        draft, first, _ = self._flow()
        changed = self.write_json(
            "n.draft.json", {"id": "t", "tagger": "rule", "sentences": sentences("“와!”", "“춥다.”", "둘이 웃었다.", "“왜?”")}
        )
        result = self.run_script("apply_labels.py", changed, self.write_json("a.json", first), self.dir / "x.draft.json")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.dir / "x.draft.json").exists())

    def _candidates(self, lines: list[dict], **extra: object) -> dict:
        path = self.write_json("m.draft.json", {"id": "t", "tagger": "guyeon-skill", "draftHash": "x", "sentences": lines, **extra})
        self.assertEqual(self.run_script("decision_candidates.py", path, self.dir / "c.json").returncode, 0)
        return json.loads((self.dir / "c.json").read_text(encoding="utf-8"))

    def test_ending_row_covers_the_last_scene_not_the_last_run(self) -> None:
        lines = [
            {**line, "role": "narration", "speaker": "narrator", "emotion": "neutral"} for line in sentences("가.", "나.", "다.", "라.")
        ]
        rows = self._candidates(lines, scenes=[{"from": 0, "to": 2, "summary": "앞"}, {"from": 3, "to": 3, "summary": "끝"}])["rows"]
        row = next(row for row in rows if row["kind"] == "결말")
        self.assertEqual((row["from"], row["to"], row["text"]), (3, 3, "라."))

    def test_judged_sentences_are_not_asked_again(self) -> None:
        lines = [
            {**line, "role": "narration", "speaker": "narrator", "emotion": "sadness"}
            for line in sentences("가.", "나.", "다.", "라.", "마.")
        ]
        lines[1] = {**lines[1], "notes": ["검수 요청: 슬픈가"]}
        rows = self._candidates(lines, judged=[0, 1, 2, 3], scenes=[{"from": 4, "to": 4, "summary": "끝"}])["rows"]
        self.assertEqual([row for row in rows if row["from"] in (0, 1, 2, 3)], [])

    def test_candidates_keep_rows_that_share_a_start(self) -> None:
        lines = [
            {**line, "role": "narration", "speaker": "narrator", "emotion": "neutral"} for line in sentences("가.", "나.", "다.", "라.")
        ]
        lines[2] = {**lines[2], "suggestedStyle": "excited", "emotion": "anger", "notes": ["검수 요청: 화난 대사"]}
        result = self._candidates(lines, scenes=[{"from": 0, "to": 1, "summary": "앞"}, {"from": 2, "to": 3, "summary": "끝"}])
        kinds = {row["kind"] for row in [*result["rows"], *result["overflow"]] if row["from"] == 2}
        self.assertLessEqual({"결말", "감정과 목소리 어긋남", "검수 요청"}, kinds)

    def test_outputs_can_be_read_by_others(self) -> None:
        draft, first, _ = self._flow()
        merged = self.dir / "m.draft.json"
        self.assertEqual(self.run_script("apply_labels.py", draft, self.write_json("a.json", first), merged).returncode, 0)
        self.assertEqual(merged.stat().st_mode & 0o777, 0o644)


if __name__ == "__main__":
    unittest.main()
