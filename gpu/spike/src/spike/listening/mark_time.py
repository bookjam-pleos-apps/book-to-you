"""청취자가 적은 지목 시각("분:초")을 초로 읽는다. 외부 라이브러리 없는 순수 로직이다."""


def mark_seconds(text: str) -> float:
    minutes, seconds = text.split(":")
    return int(minutes) * 60 + float(seconds)
