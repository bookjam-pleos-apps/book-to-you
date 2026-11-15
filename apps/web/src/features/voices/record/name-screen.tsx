import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { QUERY_KEYS } from "../../../shared/api-client/query-keys";
import { HOME_PATH } from "../../../shared/routing/return-path";
import { ProblemAlert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Form } from "../../../shared/ui/form";
import { Dock, Screen, TopBar } from "../../../shared/ui/screen";
import { Title } from "../../../shared/ui/text";
import { LabelPicker } from "../label-picker";
import { recordStepPath } from "../voice-paths";
import { createVoice } from "../voices-api";

const useCreateVoice = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createVoice,
    onSuccess: (voice) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.voices });
      navigate(recordStepPath(voice.id, "consent"), { replace: true });
    },
  });
};

export const NameScreen = () => {
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const create = useCreateVoice();
  const trimmed = label.trim();
  return (
    <Screen>
      <TopBar title="목소리 추가하기" onBack={() => navigate(HOME_PATH)} />
      <Form onSubmit={() => create.mutate(trimmed)}>
        <Title>누구 목소리인가요?</Title>
        <LabelPicker label={label} onChange={setLabel} />
        {create.isError ? <ProblemAlert title="만들지 못했어요" body="잠시 뒤에 다시 해 주세요." /> : null}
        <Dock>
          <Button type="submit" className="w-full" disabled={trimmed === "" || create.isPending}>
            다음
          </Button>
        </Dock>
      </Form>
    </Screen>
  );
};
