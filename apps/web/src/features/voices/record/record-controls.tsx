import { METER_STEP_COUNT } from "../../../lib/recorder/input-level";
import { formatClock } from "../../../shared/lib/clock";
import { cn } from "../../../shared/lib/utils";
import { MicIcon } from "../../../shared/ui/icons";

// 녹음 버튼은 주 버튼과 같은 두 토큰(button-brand, on-button-brand)만 쓴다.
type RecordButtonProps = { readonly onStart: () => void; readonly label: string; readonly hint: string; readonly disabled?: boolean };

export const RecordButton = ({ onStart, label, hint, disabled = false }: RecordButtonProps) => (
  <>
    <button type="button" disabled={disabled}
      className="grid size-20 place-items-center rounded-full bg-button-brand text-on-button-brand shadow-cta active:translate-y-px disabled:opacity-40 disabled:shadow-none"
      onClick={onStart} aria-label={label}>
      <MicIcon className="size-12" />
    </button>
    <div className="flex flex-col items-center gap-1">
      <span aria-hidden="true" className="text-label font-semibold">{label}</span>
      <span className="text-center text-caption-sm text-ink-3">{hint}</span>
    </div>
  </>
);

const METER_HEIGHTS = ["h-1", "h-1.5", "h-2.5", "h-3", "h-4"] as const;

// 마이크에 소리가 들어오는지만 알린다. 무음 녹음(안드로이드)을 녹음 중에 알아차리게 한다.
const LevelMeter = ({ level }: { readonly level: number }) => (
  <div className="flex h-4 items-end gap-1" aria-hidden="true">
    {Array.from({ length: METER_STEP_COUNT }, (_, index) => (
      <span key={index} className={cn("w-1 rounded-full", METER_HEIGHTS[index] ?? "h-4", index < level ? "bg-brand" : "bg-fill-strong")} />
    ))}
  </div>
);

type RecordingNowProps = { readonly elapsedMs: number; readonly maxMs: number; readonly level: number; readonly onStop: () => void };

export const RecordingNow = ({ elapsedMs, maxMs, level, onStop }: RecordingNowProps) => (
  <>
    <LevelMeter level={level} />
    <p className="flex items-baseline gap-2">
      <span className="text-timer font-bold tabular-nums">{formatClock(elapsedMs)}</span>
      <span className="text-caption font-bold text-ink-3 tabular-nums">/ {formatClock(maxMs)}</span>
    </p>
    <button type="button" className="grid size-20 place-items-center rounded-full border-4 border-brand bg-surface shadow-cta"
      onClick={onStop} aria-label="녹음 끝내기">
      <span className="size-stop rounded-stop bg-brand" />
    </button>
    <span aria-hidden="true" className="text-label font-semibold">녹음 끝내기</span>
  </>
);
