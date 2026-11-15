import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { STORIES_PATH } from "../features/library/library-paths";
import { MakeStory, useStoryTitle } from "../features/library/make-story";
import { MAKING_NOTICE } from "../features/library/shelf";
import { StoryCover } from "../features/library/story-cover";
import { initialVoiceId, ReadyVoicePicker, readyVoices } from "../features/voices/manage/ready-voice-picker";
import { nextVoiceAction } from "../features/voices/manage/voice-card-view";
import { useVoices } from "../features/voices/voices-api";
import { Button } from "../shared/ui/button";
import { PendingLoads } from "../shared/ui/pending-loads";
import { Dock, Screen, TopBar } from "../shared/ui/screen";
import { Body, Lead, SectionTitle, Title } from "../shared/ui/text";

const NoReadyVoice = ({ voices }: { readonly voices: readonly VoiceResponse[] }) => {
  const navigate = useNavigate();
  const action = nextVoiceAction(voices);
  if (action === null) return <Body>목소리를 확인하고 있어요. 확인이 끝나면 동화를 만들 수 있어요.</Body>;
  return (
    <>
      <Body>목소리 녹음을 마치면 동화를 만들 수 있어요.</Body>
      <Dock>
        <Button className="w-full" onClick={() => navigate(action.path)}>
          {action.label}
        </Button>
      </Dock>
    </>
  );
};

type ChooserProps = { readonly storyId: string; readonly ready: readonly VoiceResponse[]; readonly firstVoiceId: string };

const VoiceChooser = ({ storyId, ready, firstVoiceId }: ChooserProps) => {
  const [voiceId, setVoiceId] = useState(firstVoiceId);
  return (
    <>
      {/* 준비된 목소리가 하나뿐이면 고를 것이 없어 묻지 않는다. */}
      {ready.length > 1 ? (
        <>
          <SectionTitle>누구 목소리로 만들까요?</SectionTitle>
          <ReadyVoicePicker ready={ready} voiceId={voiceId} onPick={setVoiceId} />
        </>
      ) : null}
      <MakeStory storyId={storyId} voiceId={voiceId} />
    </>
  );
};

const MakeBody = ({ storyId }: { readonly storyId: string }) => {
  const voices = useVoices();
  if (!voices.data) return <PendingLoads queries={[voices]} />;
  const ready = readyVoices(voices.data.voices);
  const firstVoiceId = initialVoiceId(ready);
  if (firstVoiceId === undefined) return <NoReadyVoice voices={voices.data.voices} />;
  return <VoiceChooser storyId={storyId} ready={ready} firstVoiceId={firstVoiceId} />;
};

// 동화(library)와 목소리(voices)를 함께 쓰는 화면이라 app에 둔다.
export const StoryMakeScreen = () => {
  const navigate = useNavigate();
  const { storyId } = useParams();
  const title = useStoryTitle(storyId ?? "");
  if (storyId === undefined) return <Navigate to={STORIES_PATH} replace />;
  return (
    <Screen>
      <TopBar title="동화 만들기" onBack={() => navigate(STORIES_PATH)} />
      <StoryCover storyId={storyId} shape="landscape" />
      <Title>{title ?? "동화"}</Title>
      <Lead>{MAKING_NOTICE}</Lead>
      <MakeBody storyId={storyId} />
    </Screen>
  );
};
