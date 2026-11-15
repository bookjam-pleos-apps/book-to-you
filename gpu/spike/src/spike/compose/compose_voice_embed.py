"""voice-clone 서비스의 voice-embed 워크플로우로 음성 파일의 화자 임베딩을 받는다. 어댑터(HTTP)."""
import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from spike.compose.compose_http import run_workflow

VOICE_EMBED_WORKFLOW = "voice-embed"


@dataclass(frozen=True)
class ComposeVoiceEmbedder:
    url: str

    def __call__(self, paths: Sequence[Path]) -> list[np.ndarray]:
        reply = json.loads(run_workflow(self.url, VOICE_EMBED_WORKFLOW, {"paths": [str(path.resolve()) for path in paths]}))
        if len(reply) != len(paths):
            raise ValueError(f"임베딩 {len(reply)}개가 파일 {len(paths)}개와 다릅니다")
        return [np.asarray(vector, dtype=np.float64) for vector in reply]
