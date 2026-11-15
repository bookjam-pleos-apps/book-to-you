"""compose 워크플로우 voice-embed의 shell 단계. 음성 파일마다 ECAPA 화자 임베딩을 JSON 한 줄로 stdout에 쓴다.

렌더 경보(render_alert_measure.unit_similarities)와 같은 측정이다: 말소리 구간만 남겨 임베딩한다.
torch와 speechbrain이 필요해 렌더 단계(SPIKE_PYTHON, audio extra)와 다른 환경(SPIKE_VOICE_PYTHON, gpu extra)에서 돈다.
GPU는 Qwen과 whisper가 쓰므로 기본은 CPU다.
사용: python -m spike.run_voice_embed --paths='["/job/attempts/0003-a0.wav", "/job/reference-child.wav"]' [--device cpu]
"""
import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from spike.sound.audio_io import read_audio
from spike.compose.shell_step import run_json_step
from spike.sound.speech_activity import speech_only


def embed_paths(paths: Sequence[str], device: str) -> list[list[float]]:
    from spike.clone.scoring.speaker_embedding import EcapaEmbedder

    embedder = EcapaEmbedder(device)
    return [embedder.embed(speech_only(read_audio(Path(path)))).astype(float).tolist() for path in paths]


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--paths", required=True)
    parser.add_argument("--device", default="cpu")
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    raise SystemExit(run_json_step(lambda: embed_paths(json.loads(args.paths), args.device)))


if __name__ == "__main__":
    main()
