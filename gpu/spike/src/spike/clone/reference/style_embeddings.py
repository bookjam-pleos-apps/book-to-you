"""화자의 style별 참조 녹음을 임베딩으로 바꾼다. style마다 자기 참조와 비교해야 표현 차이가 목소리 차이로 잡히지 않는다."""
from collections.abc import Iterable

import numpy as np

from spike.sound.audio_io import read_audio
from spike.clone.identity import Embedder
from spike.clone.layout import Condition
from spike.clone.reference.ref_prep import prepared_speaker_reference


def style_embeddings(speaker: str, condition: Condition, styles: Iterable[str], embedder: Embedder) -> dict[str, np.ndarray]:
    return {style: embedder.embed(read_audio(prepared_speaker_reference(speaker, condition, style))) for style in set(styles)}
