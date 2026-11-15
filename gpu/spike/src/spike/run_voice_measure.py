"""compose 워크플로우 check-clip의 shell 단계. stdin으로 받은 녹음 하나의 음높이와 말한 시간을 JSON 한 줄로 stdout에 쓴다.

run_reference_check와 같은 pYIN·말소리 구간으로 잰다. 기준(녹음 대본 파일의 styleChecks)을 정한 측정과 자가 같아야 한다.
판정은 하지 않는다. calm과 비교하는 일은 측정값을 저장하는 API가 한다.
녹음은 stdin으로 받는다. shell 컴포넌트는 명령 문자열 안의 업로드를 경로로 바꿔 주지 않는다(맥 스모크).
model-compose shell 컴포넌트는 실패해도 예외를 내지 않는다. 실패하면 stdout이 비어 `${result.stdout as json}` 해석이 실패하고
워크플로우가 멈춘다. 측정 없이 통과하는 일이 없다.

사용: python -m spike.run_voice_measure < 녹음.wav
"""
import json
import sys

from spike.sound.audio_io import decode_audio
from spike.sound.clip_measure import clip_measure_document, measure_clip
from spike.sound.pitch_tracker import PyinPitchTracker


def main() -> None:
    audio = decode_audio(sys.stdin.buffer.read())
    print(json.dumps(clip_measure_document(measure_clip(audio, PyinPitchTracker().track(audio)))))


if __name__ == "__main__":
    main()
