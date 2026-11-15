import { useRef } from "react";

import { formatClock, playbackPercent } from "../lib/clock";
import { PauseIcon, PlayIcon } from "./icons";
import { Progress } from "./progress";
import { usePlayback, type PlaybackSource } from "./use-playback";

type PlaybackBarProps = { readonly source: PlaybackSource; readonly durationMs: number; readonly idleLabel?: string };

// 방금 녹음한 것이나 만든 동화를 듣는 막대다. 재생 전에는 전체 길이, 재생을 시작하면 지난 시간을 보인다.
export const PlaybackBar = ({ source, durationMs, idleLabel = "다시 듣기" }: PlaybackBarProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playback = usePlayback(audioRef, source);
  const started = playback.playing || playback.positionMs > 0;
  return (
    <div className="flex h-12 w-full items-center gap-2 rounded-full border border-brand bg-surface pr-4 pl-1.5">
      <audio ref={audioRef} preload="metadata" {...playback.handlers} />
      <button type="button" className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium text-ink-2" onClick={playback.toggle}>
        {playback.playing ? <PauseIcon className="size-3.5 text-ink" /> : <PlayIcon className="size-3.5 text-ink" />}
        {playback.playing ? "멈추기" : idleLabel}
      </button>
      <Progress value={playbackPercent(playback.positionMs, durationMs)} aria-label="재생 위치" className="min-w-0 flex-1" />
      <span className="text-caption font-bold tabular-nums">{formatClock(started ? playback.positionMs : durationMs)}</span>
    </div>
  );
};
