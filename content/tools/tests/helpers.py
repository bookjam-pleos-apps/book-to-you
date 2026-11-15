"""시험 도우미."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
sys.dont_write_bytecode = True

from guyeon_common import draft_hash  # noqa: E402
from review_answers import row_keys  # noqa: E402


def sentences(*texts: str) -> list[dict]:
    return [
        {"index": i, "text": text, "pauseMs": 450, "notes": [], "suggestedStyle": "calm", "probabilities": {}, "confirmedStyle": None}
        for i, text in enumerate(texts)
    ]


def labels_for(lines: list[dict], **extra: object) -> dict:
    return {"draftHash": draft_hash(lines), "scenes": [{"from": 0, "to": len(lines) - 1, "summary": "장면"}], **extra}


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.dir = Path(self.folder.name)

    def run_script(self, name: str, *args: object) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, "-B", str(SCRIPTS / name), *map(str, args)], capture_output=True, text=True)

    def write_json(self, name: str, document: object) -> Path:
        path = self.dir / name
        path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
        return path

    def write_text(self, name: str, text: str) -> Path:
        path = self.dir / name
        path.write_text(text, encoding="utf-8")
        return path

    def answer_all(self, draft: Path, answer: str = "권장대로") -> Path:
        """판정표를 실제로 만들고 모든 행에 답한다."""
        table = self.dir / "answers.candidates.json"
        table.unlink(missing_ok=True)
        assert self.run_script("decision_candidates.py", draft, table).returncode == 0
        rows = json.loads(table.read_text(encoding="utf-8"))["rows"]
        return self.write_json("answers.json", {key: answer for key in row_keys(rows)})

    def _flow(self) -> tuple[Path, dict, dict]:
        lines = sentences("“와!”", "둘이 웃었다.", "“왜?”")
        draft = self.write_json("d.draft.json", {"id": "t", "tagger": "rule", "sentences": lines})
        first = labels_for(
            lines,
            cast=[{"name": "토토", "voiceType": "아기"}],
            excited=[{"index": 0, "reason": "기쁨"}],
            annotations=[{"index": 0, "speaker": "토토", "emotion": "joy"}],
        )
        review = labels_for(
            lines, excited=[{"index": 0, "reason": "기쁨"}, {"index": 1, "reason": "웃음"}], review=[{"index": 2, "reason": "누구 말인지"}]
        )
        return draft, first, review
