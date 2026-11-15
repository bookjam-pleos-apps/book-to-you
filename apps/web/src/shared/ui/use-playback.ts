import { useEffect, useState, type RefObject, type SyntheticEvent } from "react";

// <audio>의 이벤트로만 상태를 맞춘다. 재생 위치는 timeupdate(초당 약 4번)로 받는다.
// 소스가 바뀌면 emptied가 와서 위치를 처음으로 되돌린다. 소스는 방금 녹음한 Blob이나 서버 오디오 경로다.
// ref는 컴포넌트가 만들어 넘긴다. 돌려주는 값에 ref가 섞이면 렌더 중 ref 읽기로 본다(react-hooks/refs).
export type PlaybackSource = Blob | string;

export const usePlayback = (audioRef: RefObject<HTMLAudioElement | null>, source: PlaybackSource) => {
  useAudioSource(audioRef, source);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const toggle = () => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (!audio.paused) return audio.pause();
    void audio.play().catch(() => setPlaying(false));
  };
  const handlers = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onEmptied: () => {
      setPlaying(false);
      setPositionMs(0);
    },
    onTimeUpdate: (event: SyntheticEvent<HTMLAudioElement>) => setPositionMs(event.currentTarget.currentTime * 1_000),
  };
  return { playing, positionMs, toggle, handlers };
};

// objectURL을 만들고 해제하는 일을 한 effect에 둔다. StrictMode가 effect를 두 번 돌려도 해제된 URL을 다시 쓰지 않는다.
// 서버 경로는 같은 출처라 세션 쿠키로 받는다. 범위 요청(Range)은 브라우저가 알아서 보낸다.
const useAudioSource = (audioRef: RefObject<HTMLAudioElement | null>, source: PlaybackSource) => {
  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    audio.src = url;
    return () => {
      audio.removeAttribute("src");
      audio.load();
      if (typeof source !== "string") URL.revokeObjectURL(url);
    };
  }, [audioRef, source]);
};
