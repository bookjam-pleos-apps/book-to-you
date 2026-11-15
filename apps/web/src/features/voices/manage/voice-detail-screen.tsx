import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { Navigate, useNavigate, useParams } from "react-router";

import { isLoadFailed } from "../../../shared/api-client/load-state";
import { HOME_PATH } from "../../../shared/routing/return-path";
import { ProblemAlert } from "../../../shared/ui/alert";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Loading } from "../../../shared/ui/controls";
import { LinkNotice } from "../../../shared/ui/link-notice";
import { Dock, Screen, TopBar } from "../../../shared/ui/screen";
import { Lead } from "../../../shared/ui/text";
import { STEP_TITLES } from "../step-titles";
import { useUpdateVoice } from "./voice-actions";
import { voiceTodo } from "./voice-card-view";
import { VoiceMenu } from "./voice-menu";
import { recordStepPath } from "../voice-paths";
import { canBeDefault, showsDefault } from "./voice-rows";
import { VoiceStatusRows } from "./voice-status-rows";
import { isVoiceReady, optionalStyleToOffer } from "../voice-steps";
import { useVoice, useVoices } from "../voices-api";

type VoiceProps = { readonly voice: VoiceResponse; readonly voiceCount: number | undefined };

const NameRow = ({ voice, voiceCount }: VoiceProps) => (
  <div className="flex items-center gap-2">
    <h1 className="text-title font-semibold">{voice.label} 목소리</h1>
    {showsDefault(voiceCount) && voice.isDefault ? <Badge>대표</Badge> : null}
  </div>
);

// 등록을 마친 목소리는 녹음 목록 대신 한 줄로 끝낸다. 하지 않은 선택 녹음만 따로 권한다.
const ReadyBody = ({ voice }: { readonly voice: VoiceResponse }) => {
  const offer = optionalStyleToOffer(voice);
  return (
    <>
      <Lead>녹음을 모두 마쳤어요.</Lead>
      {offer === undefined ? null : (
        <LinkNotice to={recordStepPath(voice.id, offer, true)} title={`${STEP_TITLES[offer]} 녹음하기`} body="선택이에요. 해 두면 동화가 더 자연스러워져요." />
      )}
    </>
  );
};

// 남은 녹음은 줄마다 버튼을 두지 않고 "이어서 녹음하기" 하나로 순서대로 거친다.
const ResumeDock = ({ voice }: { readonly voice: VoiceResponse }) => {
  const navigate = useNavigate();
  const todo = voiceTodo(voice);
  if (todo?.kind !== "record") return null;
  return (
    <Dock>
      <Button className="w-full" onClick={() => navigate(todo.path)}>
        이어서 녹음하기
      </Button>
    </Dock>
  );
};

const VoiceDetail = ({ voice, voiceCount }: VoiceProps) => {
  const navigate = useNavigate();
  const update = useUpdateVoice(voice.id);
  const menu = (
    <VoiceMenu voice={voice} canBeDefault={canBeDefault(voice, voiceCount)} onToggleDefault={() => update.mutate({ isDefault: !voice.isDefault })} />
  );
  return (
    <>
      <TopBar onBack={() => navigate(HOME_PATH)} trailing={menu} />
      <NameRow voice={voice} voiceCount={voiceCount} />
      {isVoiceReady(voice) ? <ReadyBody voice={voice} /> : <VoiceStatusRows voice={voice} />}
      {update.isError ? <ProblemAlert title="바꾸지 못했어요" body="잠시 뒤에 다시 해 주세요." /> : null}
      <ResumeDock voice={voice} />
    </>
  );
};

const DetailBody = ({ voiceId }: { readonly voiceId: string }) => {
  const navigate = useNavigate();
  const voice = useVoice(voiceId);
  const voiceCount = useVoices().data?.voices.length;
  if (isLoadFailed(voice)) return <Navigate to={HOME_PATH} replace />;
  // 받기 전에도 상단 막대를 그려 홈으로 돌아갈 수 있게 한다.
  if (!voice.data) return <><TopBar onBack={() => navigate(HOME_PATH)} /><Loading /></>;
  return <VoiceDetail voice={voice.data} voiceCount={voiceCount} />;
};

export const VoiceDetailScreen = () => {
  const { voiceId } = useParams();
  if (voiceId === undefined) return <Navigate to={HOME_PATH} replace />;
  return (
    <Screen>
      <DetailBody voiceId={voiceId} />
    </Screen>
  );
};
