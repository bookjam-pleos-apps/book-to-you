"""word_audio 소리를 길이로 알아보고 받아쓰는 가짜 whisper."""
from spike.sound.audio import Audio


def fake_transcribe(audio: Audio) -> str:
    """2.02초는 생성음 전체, 1.47초 안팎은 진짜 쉼에서 자른 앞부분, 1.15초 안팎은 막힘에서 잘라 말끝을 잃은 앞부분이다."""
    if audio.duration_sec > 1.9:
        return "빨간 모자 그래"
    return "빨간 모자" if audio.duration_sec > 1.3 else "빨간 모"
