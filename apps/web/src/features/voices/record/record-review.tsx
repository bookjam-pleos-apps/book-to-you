import type { RecordedClip } from "../../../lib/recorder/recorder-state";
import { Button } from "../../../shared/ui/button";
import { PlaybackBar } from "../../../shared/ui/playback-bar";

type ReviewProps = {
  readonly clip: RecordedClip;
  readonly blocked: boolean;
  // 서버가 이 녹음을 거절했다. 올리기 버튼을 빼고 다시 녹음만 남긴다.
  readonly retakeOnly: boolean;
  readonly uploading: boolean;
  readonly onRetake: () => void;
  readonly onUpload: () => void;
};

const UploadChoice = ({ blocked, uploading, onRetake, onUpload }: Omit<ReviewProps, "clip" | "retakeOnly">) => (
  <div className="flex w-full gap-2">
    <Button variant="outline" className="w-retake" onClick={onRetake} disabled={uploading}>
      다시 녹음
    </Button>
    <Button className="min-w-0 flex-1" onClick={onUpload} disabled={uploading || blocked}>
      {uploading ? "올리는 중…" : "이걸로 할게요"}
    </Button>
  </div>
);

export const Review = ({ clip, retakeOnly, ...choice }: ReviewProps) => (
  <>
    <PlaybackBar source={clip.blob} durationMs={clip.durationMs} />
    {retakeOnly ? (
      <Button className="w-full" onClick={choice.onRetake}>
        다시 녹음
      </Button>
    ) : (
      <UploadChoice {...choice} />
    )}
  </>
);
