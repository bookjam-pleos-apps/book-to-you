import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { Navigate, useNavigate, useParams } from "react-router";

import { useVoice } from "../features/voices/voices-api";
import { HOME_PATH } from "../shared/routing/return-path";
import { Button } from "../shared/ui/button";
import { PendingLoads } from "../shared/ui/pending-loads";
import { Dock, Screen, TopBar } from "../shared/ui/screen";
import { Lead, Title } from "../shared/ui/text";
import { afterRecording } from "./next-steps";

// 녹음을 마친 직후다. 줄마다 버튼을 늘어놓지 않고 다음 할 일 하나만 보인다. 선택 녹음은 그 아래 보조 버튼으로 권한다.
const DoneNext = ({ voice }: { readonly voice: VoiceResponse }) => {
  const navigate = useNavigate();
  const next = afterRecording(voice);
  const { extra } = next;
  return (
    <>
      <Lead>{next.body}</Lead>
      <Dock>
        <Button className="w-full" onClick={() => navigate(next.action.path)}>
          {next.action.label}
        </Button>
        {extra === undefined ? null : (
          <Button variant="outline" className="w-full" onClick={() => navigate(extra.path)}>
            {extra.label}
          </Button>
        )}
      </Dock>
    </>
  );
};

const DoneBody = ({ voiceId }: { readonly voiceId: string }) => {
  const navigate = useNavigate();
  const voice = useVoice(voiceId);
  return (
    <>
      <TopBar onBack={() => navigate(HOME_PATH)} />
      <Title>녹음을 마쳤어요</Title>
      {voice.data ? <DoneNext voice={voice.data} /> : <PendingLoads queries={[voice]} />}
    </>
  );
};

export const VoiceDoneScreen = () => {
  const { voiceId } = useParams();
  if (voiceId === undefined) return <Navigate to={HOME_PATH} replace />;
  return (
    <Screen>
      <DoneBody voiceId={voiceId} />
    </Screen>
  );
};
