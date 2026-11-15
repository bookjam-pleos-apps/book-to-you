"""원고가 바뀐 뒤 라벨을 옮기는 시험. 사용: python3 -m unittest discover -s <skill>/tests"""

import json
import unittest

from helpers import Base, labels_for, sentences

from label_rules import label_problems


class Rebase(Base):
    def test_rebase_keeps_labels_and_forces_a_look_at_new_sentences(self) -> None:
        draft, first, _ = self._flow()
        new_lines = sentences("“춥다.”", "“와!”", "둘이 웃었다.", "“왜?”")
        new = self.write_json("n.draft.json", {"id": "t", "tagger": "rule", "sentences": new_lines})
        out = self.dir / "re.json"
        self.assertEqual(self.run_script("rebase_labels.py", draft, self.write_json("a.json", first), new, out).returncode, 0)
        rebased = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(label_problems(rebased, new_lines), [])
        self.assertEqual(rebased["excited"][0]["index"], 1)
        self.assertEqual([item["index"] for item in rebased["relabel"]], [0])
        self.assertNotEqual(self.run_script("apply_labels.py", new, out, self.dir / "x.draft.json").returncode, 0)

    def test_rebase_of_an_edited_word_keeps_scenes_and_points_to_the_old_label(self) -> None:
        lines = sentences("하나.", "“와!”", "셋.", "넷.")
        old = self.write_json("o.draft.json", {"id": "t", "tagger": "rule", "sentences": lines})
        labels = {
            **labels_for(lines, excited=[{"index": 1, "reason": "기쁨"}]),
            "scenes": [{"from": 0, "to": 0, "summary": "첫"}, {"from": 1, "to": 3, "summary": "둘째"}],
        }
        new_lines = sentences("하나.", "“와아!”", "셋.", "넷.")
        new = self.write_json("n.draft.json", {"id": "t", "tagger": "rule", "sentences": new_lines})
        out = self.dir / "re.json"
        self.assertEqual(self.run_script("rebase_labels.py", old, self.write_json("l.json", labels), new, out).returncode, 0)
        rebased = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(rebased["scenes"], labels["scenes"])
        self.assertEqual(rebased["relabel"], [{"index": 1, "previousIndex": 1, "previousStyle": "excited"}])
        self.assertEqual(rebased["excited"], [])

    def test_rebase_refuses_labels_from_another_draft(self) -> None:
        draft, first, _ = self._flow()
        other = self.write_json("o.draft.json", {"id": "t", "tagger": "rule", "sentences": sentences("다른 문장.")})
        result = self.run_script("rebase_labels.py", other, self.write_json("a.json", first), draft, self.dir / "re.json")
        self.assertNotEqual(result.returncode, 0)

    def _rebase(self, lines: list[dict], labels: dict, new_lines: list[dict]) -> dict:
        old = self.write_json("o.draft.json", {"id": "t", "tagger": "rule", "sentences": lines})
        new = self.write_json("n.draft.json", {"id": "t", "tagger": "rule", "sentences": new_lines})
        out = self.dir / "re.json"
        result = self.run_script("rebase_labels.py", old, self.write_json("l.json", labels), new, out)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(out.read_text(encoding="utf-8"))

    def test_rebase_does_not_point_to_a_deleted_neighbor(self) -> None:
        lines = sentences("가.", "나는 슬펐다.", "다 신났다!", "라.")
        labels = labels_for(lines, soft=[{"index": 1, "reason": "슬픔"}], excited=[{"index": 2, "reason": "신남"}])
        rebased = self._rebase(lines, labels, sentences("가.", "다 정말 신났다!", "라."))
        self.assertEqual(rebased["relabel"][0], {"index": 1, "previousIndex": None, "previousStyle": None})

    def test_rebase_keeps_a_decision_on_an_edited_sentence(self) -> None:
        lines = sentences("가.", "다 신났다!", "라.")
        decision = {"index": 1, "field": "style", "text": "다 신났다!", "first": "calm", "review": "excited", "reason": "r"}
        rebased = self._rebase(lines, labels_for(lines, decisions=[decision]), sentences("가.", "다 정말 신났다!", "라."))
        self.assertEqual([(item["index"], item["text"]) for item in rebased["decisions"]], [(1, "다 정말 신났다!")])

    def test_rebase_blocks_on_a_decision_it_cannot_place(self) -> None:
        lines = sentences("가.", "나는 슬펐다.", "다 신났다!", "라.")
        decision = {"index": 2, "field": "style", "text": "다 신났다!", "first": "calm", "review": "excited", "reason": "r"}
        rebased = self._rebase(lines, labels_for(lines, decisions=[decision]), sentences("가.", "다 정말 신났다!", "라."))
        self.assertEqual(rebased["decisions"], [])
        self.assertTrue(any(item.get("lostDecision") == "다 신났다!" for item in rebased["relabel"]))

    def test_rebase_drops_notes_of_deleted_sentences(self) -> None:
        lines = sentences("가.", "지울 문장.", "다.")
        labels = labels_for(lines, review=[{"index": 1, "reason": "지울 문장 메모"}, {"index": 2, "reason": "남길 메모"}])
        rebased = self._rebase(lines, labels, sentences("가.", "다."))
        self.assertEqual(rebased["review"], [{"index": 1, "reason": "남길 메모"}])

    def test_rebase_does_not_guess_on_repeated_lines(self) -> None:
        lines = sentences("“콩이다!”", "곰이 왔다.", "“콩이다!”", "모두 웃었다.")
        old = self.write_json("o.draft.json", {"id": "t", "tagger": "rule", "sentences": lines})
        labels = labels_for(lines, excited=[{"index": 0, "reason": "기쁨"}])
        new_lines = sentences("“콩이다!”", "모두 웃었다.")
        new = self.write_json("n.draft.json", {"id": "t", "tagger": "rule", "sentences": new_lines})
        out = self.dir / "re.json"
        self.assertEqual(self.run_script("rebase_labels.py", old, self.write_json("l.json", labels), new, out).returncode, 0)
        self.assertEqual([item["index"] for item in json.loads(out.read_text(encoding="utf-8"))["relabel"]], [0])


if __name__ == "__main__":
    unittest.main()
