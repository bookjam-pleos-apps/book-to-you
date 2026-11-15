import type { RecordedClip } from "../../../lib/recorder/recorder-state";
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { PlaybackBar } from "../../../shared/ui/playback-bar";
import type { Feedback } from "./recording-feedback";

// 통과한 녹음에 붙는 권유와, 그대로 넘어갈 때 할 일이다.
export type Coaching = { readonly feedback: Feedback; readonly onSkip: () => void };

// 경고가 아니라 권유다. 스크린리더가 끼어들어 읽지 않게 한다.
export const CoachingAlert = ({ feedback }: { readonly feedback: Feedback }) => (
  <Alert role="status">
    <AlertTitle>{feedback.title}</AlertTitle>
    <AlertDescription>{feedback.body}</AlertDescription>
  </Alert>
);

export const SkipButton = ({ onSkip }: { readonly onSkip: () => void }) => (
  <Button variant="outline" className="w-full" onClick={onSkip}>
    이대로 넘어가기
  </Button>
);

type ChoiceProps = { readonly clip: RecordedClip; readonly onRetake: () => void; readonly onSkip: () => void };

// 녹음은 이미 통과했다. 방금 녹음을 들어 보고, 다시 읽을지 그대로 넘어갈지 부모가 고른다.
export const CoachingChoice = ({ clip, onRetake, onSkip }: ChoiceProps) => (
  <>
    <PlaybackBar source={clip.blob} durationMs={clip.durationMs} />
    <Button className="w-full" onClick={onRetake}>
      다시 읽어 볼게요
    </Button>
    <SkipButton onSkip={onSkip} />
  </>
);
