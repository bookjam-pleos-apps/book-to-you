import type { RenderDetail } from "@voice-storybook/shared/contracts/v1";
import { useRef, type ReactNode } from "react";

import { Badge } from "../../shared/ui/badge";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "../../shared/ui/icons";
import { Progress } from "../../shared/ui/progress";
import { Dock } from "../../shared/ui/screen";
import { chapterCount, chapterHeading, chapterTitle, segmentFills } from "./chapter-player";
import { useChapterPlayer } from "./use-chapter-player";

// 장마다 칸 하나다. 화면 낭독기는 칸마다 "제N장"과 들은 비율을 읽는다.
const ChapterSegments = ({ fills }: { readonly fills: readonly number[] }) => (
  <div className="flex gap-1.5">
    {fills.map((fill, i) => (
      <Progress key={i} thick value={Math.round(fill * 100)} aria-label={chapterTitle(i)} className="flex-1" />
    ))}
  </div>
);

type SideButtonProps = { readonly label: string; readonly disabled: boolean; readonly onClick: () => void; readonly children: ReactNode };

// 이전 장·다음 장이다. 차량 재생 화면처럼 흰 원 아래에 글자를 둔다(아이콘만으로는 뜻이 모호하다).
const SideButton = ({ label, disabled, onClick, children }: SideButtonProps) => (
  <button type="button" className="mt-3 flex flex-col items-center gap-2 text-caption font-bold text-ink-2 disabled:opacity-40" disabled={disabled} onClick={onClick}>
    <span className="grid size-17 place-items-center rounded-full bg-surface text-ink shadow-button">{children}</span>
    {label}
  </button>
);

const MainButton = ({ playing, onClick }: { readonly playing: boolean; readonly onClick: () => void }) => (
  <button type="button" className="flex flex-col items-center gap-2 text-caption font-bold text-ink-2" onClick={onClick}>
    <span className="grid size-23 place-items-center rounded-full bg-button-brand text-on-button-brand shadow-cta">
      {playing ? <PauseIcon className="size-9" /> : <PlayIcon className="size-9" />}
    </span>
    {playing ? "잠깐 멈춤" : "듣기"}
  </button>
);

type Chapters = RenderDetail["chapters"];

// 차량 재생 화면(분할 창)과 같은 모양의 플레이어다. 장 단위로 넘기고, 장이 끝나면 다음 장을 이어 튼다.
export const StoryPlayer = ({ chapters }: { readonly chapters: Chapters }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const player = useChapterPlayer(audioRef, chapters);
  const total = chapters.length;
  return (
    <>
      <audio ref={audioRef} preload="metadata" {...player.handlers} />
      <div className="flex items-center justify-between">
        <span className="text-lg/6 font-bold text-ink-2">{chapterHeading(player.index, chapters[player.index]?.title ?? null)}</span>
        <Badge>{chapterCount(player.index, total)}</Badge>
      </div>
      <ChapterSegments fills={segmentFills(total, player.index, player.positionMs, player.durationMs)} />
      <Dock className="flex-row items-start justify-center gap-6">
        <SideButton label="이전 장" disabled={!player.canGoPrevious} onClick={player.previous}><PreviousIcon className="size-6" /></SideButton>
        <MainButton playing={player.playing} onClick={player.toggle} />
        <SideButton label="다음 장" disabled={!player.canGoNext} onClick={player.next}><NextIcon className="size-6" /></SideButton>
      </Dock>
    </>
  );
};
