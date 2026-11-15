import type { RenderDetail } from "@voice-storybook/shared/contracts/v1";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { usePlayback } from "../../shared/ui/use-playback";
import { nextChapter, previousChapter, toggleAction } from "./chapter-player";

type Chapter = RenderDetail["chapters"][number];

// 장을 옮길 때 이어 틀지 기억한다. 이어 틀 차례인 동안(awaiting)은 화면에 재생 중으로 보여,
// 장이 넘어갈 때 버튼이 "듣기"로 깜빡이지 않는다.
const useResumeFlag = () => {
  const playOnLoad = useRef(false);
  const [awaiting, setAwaiting] = useState(false);
  const arm = (keepPlaying: boolean) => {
    playOnLoad.current = keepPlaying;
    setAwaiting(keepPlaying);
  };
  const settle = useCallback(() => setAwaiting(false), []);
  const consume = useCallback(() => {
    const go = playOnLoad.current;
    playOnLoad.current = false;
    return go;
  }, []);
  return { awaiting, arm, settle, consume };
};

// 새 장의 소스가 달린 뒤에 튼다. 반드시 usePlayback보다 뒤에 부른다(같은 렌더의 effect는 선언 순서대로 돈다).
// 앞에 두면 옛 소스를 틀다가 소스 교체가 재생을 끊는다(캡처에서 다음 장이 멈춘 채 남았다).
const usePlayOnChapterLoad = (audioRef: RefObject<HTMLAudioElement | null>, index: number, resume: ReturnType<typeof useResumeFlag>) => {
  const { consume, settle } = resume;
  useEffect(() => {
    if (!consume()) return;
    // iOS가 사용자 동작 없는 재생을 막으면 멈춘 채 "듣기"를 보인다.
    void audioRef.current?.play().catch(settle);
  }, [audioRef, index, consume, settle]);
};

// 지금 장, 다 들었는지, 장 옮기기다. 듣던 중이면 옮긴 장도 이어 튼다.
const useChapterCursor = (total: number) => {
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const resume = useResumeFlag();
  const goTo = (target: number | null, keepPlaying: boolean) => {
    if (target === null) return;
    setFinished(false);
    resume.arm(keepPlaying);
    setIndex(target);
  };
  const endChapter = () => {
    const following = nextChapter(index, total);
    if (following === null) setFinished(true);
    goTo(following, true);
  };
  // 제1장 하나뿐이면 장이 바뀌지 않아 이어 틀기 effect가 돌지 않는다. 그 자리에서 다시 튼다.
  const restart = (playHere: () => void) => {
    if (index !== 0) return goTo(0, true);
    setFinished(false);
    playHere();
  };
  return { index, finished, goTo, endChapter, restart, resume };
};

type PlaybackHandlers = ReturnType<typeof usePlayback>["handlers"];

// 재생이 실제로 시작되거나 멈추면 이어 틀기 기다림을 끝낸다. 장이 끝나면 다음 장으로 간다.
const chapterHandlers = (handlers: PlaybackHandlers, settle: () => void, onChapterEnd: () => void): PlaybackHandlers => ({
  ...handlers,
  onPlay: () => {
    handlers.onPlay();
    settle();
  },
  onPause: () => {
    handlers.onPause();
    settle();
  },
  onEnded: () => {
    handlers.onEnded();
    onChapterEnd();
  },
});

// 장을 하나의 <audio>로 차례로 튼다. 한 장이 끝나면 다음 장을 이어 튼다.
// ref는 컴포넌트가 만들어 넘긴다(돌려주는 값에 ref를 섞지 않는다).
export const useChapterPlayer = (audioRef: RefObject<HTMLAudioElement | null>, chapters: readonly Chapter[]) => {
  const cursor = useChapterCursor(chapters.length);
  const chapter = chapters[cursor.index];
  const durationMs = chapter?.durationMs ?? 0;
  const playback = usePlayback(audioRef, chapter?.audioUrl ?? "");
  usePlayOnChapterLoad(audioRef, cursor.index, cursor.resume);
  const playing = playback.playing || cursor.resume.awaiting;
  return {
    index: cursor.index,
    durationMs,
    playing,
    // 다 들은 뒤에는 진행 칸이 모두 찬 채로 남는다.
    positionMs: cursor.finished ? durationMs : playback.positionMs,
    canGoPrevious: previousChapter(cursor.index) !== null,
    canGoNext: nextChapter(cursor.index, chapters.length) !== null,
    toggle: () => (toggleAction(cursor.finished) === "restart" ? cursor.restart(playback.toggle) : playback.toggle()),
    previous: () => cursor.goTo(previousChapter(cursor.index), playing),
    next: () => cursor.goTo(nextChapter(cursor.index, chapters.length), playing),
    handlers: chapterHandlers(playback.handlers, cursor.resume.settle, cursor.endChapter),
  };
};
