import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";

import { isLoadFailed } from "../../../shared/api-client/load-state";
import { HOME_PATH } from "../../../shared/routing/return-path";
import { Loading } from "../../../shared/ui/controls";
import { Screen, TopBar } from "../../../shared/ui/screen";
import { ConsentStep } from "./consent-step";
import { ScriptStep } from "./script-step";
import { isOnlyMode, nextPath, voiceDetailPath } from "../voice-paths";
import { isVoiceStep, stepProgress, type VoiceStep } from "../voice-steps";
import { useVoice } from "../voices-api";

type FlowStepProps = { readonly voice: VoiceResponse; readonly step: VoiceStep; readonly only: boolean; readonly onNext: () => void };

const FlowStep = ({ voice, step, only, onNext }: FlowStepProps) =>
  step === "consent" ? (
    <ConsentStep key={step} voice={voice} onNext={onNext} skipTo={nextPath(voice.id, step, only)} />
  ) : (
    <ScriptStep key={step} voice={voice} step={step} onNext={onNext} nextLabel={only ? "돌아가기" : "다음으로"} />
  );

const FlowBody = ({ voiceId, step }: { readonly voiceId: string; readonly step: VoiceStep }) => {
  const navigate = useNavigate();
  const only = isOnlyMode(useLocation().search);
  const voice = useVoice(voiceId);
  // 다시 받기만 실패했으면 이전 데이터로 계속 보인다. 처음부터 못 받았을 때만 홈으로 보낸다.
  if (isLoadFailed(voice)) return <Navigate to={HOME_PATH} replace />;
  // 상단 막대는 목소리를 받기 전에도 그려 뒤로 갈 수 있게 한다. 이름은 받은 뒤에 붙는다.
  const label = voice.data ? `${voice.data.label} 목소리` : "목소리";
  return (
    <>
      <TopBar
        title={label}
        onBack={() => navigate(only ? voiceDetailPath(voiceId) : HOME_PATH)}
        progress={only ? undefined : stepProgress(step)}
      />
      {voice.data ? (
        <FlowStep voice={voice.data} step={step} only={only} onNext={() => navigate(nextPath(voiceId, step, only), { replace: only })} />
      ) : (
        <Loading />
      )}
    </>
  );
};

export const RecordFlowScreen = () => {
  const { voiceId, step } = useParams();
  if (voiceId === undefined || !isVoiceStep(step)) return <Navigate to={HOME_PATH} replace />;
  return (
    <Screen>
      <FlowBody voiceId={voiceId} step={step} />
    </Screen>
  );
};
