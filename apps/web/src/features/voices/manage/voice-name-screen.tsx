import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import { isLoadFailed } from "../../../shared/api-client/load-state";
import { HOME_PATH } from "../../../shared/routing/return-path";
import { ProblemAlert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Loading } from "../../../shared/ui/controls";
import { Form } from "../../../shared/ui/form";
import { Dock, Screen, TopBar } from "../../../shared/ui/screen";
import { Title } from "../../../shared/ui/text";
import { LabelPicker } from "../label-picker";
import { useRenameVoice } from "./voice-actions";
import { voiceDetailPath } from "../voice-paths";
import { useVoice } from "../voices-api";

const NameForm = ({ voiceId, current }: { readonly voiceId: string; readonly current: string }) => {
  const [label, setLabel] = useState(current);
  const rename = useRenameVoice(voiceId);
  const trimmed = label.trim();
  return (
    <Form onSubmit={() => rename.mutate(trimmed)}>
      <Title>이름을 바꿀까요?</Title>
      <LabelPicker label={label} onChange={setLabel} />
      {rename.isError ? <ProblemAlert title="바꾸지 못했어요" body="잠시 뒤에 다시 해 주세요." /> : null}
      <Dock>
        <Button type="submit" className="w-full" disabled={trimmed === "" || trimmed === current || rename.isPending}>
          저장
        </Button>
      </Dock>
    </Form>
  );
};

const NameBody = ({ voiceId }: { readonly voiceId: string }) => {
  const navigate = useNavigate();
  const voice = useVoice(voiceId);
  if (isLoadFailed(voice)) return <Navigate to={HOME_PATH} replace />;
  return (
    <>
      <TopBar title="이름 바꾸기" onBack={() => navigate(voiceDetailPath(voiceId))} />
      {voice.data ? <NameForm voiceId={voiceId} current={voice.data.label} /> : <Loading />}
    </>
  );
};

export const VoiceNameScreen = () => {
  const { voiceId } = useParams();
  if (voiceId === undefined) return <Navigate to={HOME_PATH} replace />;
  return (
    <Screen>
      <NameBody voiceId={voiceId} />
    </Screen>
  );
};
