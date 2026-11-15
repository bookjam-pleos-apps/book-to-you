import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { failureCode } from "../../shared/api-client/api-error";
import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import { HOME_PATH } from "../../shared/routing/return-path";
import { ProblemAlert } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { TextField } from "../../shared/ui/field";
import { Form } from "../../shared/ui/form";
import { Dock, Screen, TopBar } from "../../shared/ui/screen";
import { Lead, Title } from "../../shared/ui/text";
import { confirmPairing, PAIR_DONE_PATH } from "./devices-api";
import { formatPairCode, isCompletePairCode, normalizePairCode, readPairCode } from "./pair-code";

const pairErrorText = (error: unknown): string =>
  failureCode(error) === "invalid_user_code"
    ? "코드가 만료됐거나 맞지 않아요. 차 화면의 새 코드를 입력해 주세요."
    : "잠시 뒤에 다시 해 주세요.";

const usePair = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: confirmPairing,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.devices });
      navigate(PAIR_DONE_PATH, { replace: true });
    },
  });
};

export const PairScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [typed, setTyped] = useState(() => readPairCode(location.search) ?? "");
  const pair = usePair();
  const code = normalizePairCode(typed);
  return (
    <Screen>
      <TopBar title="차 연결" onBack={() => navigate(HOME_PATH)} />
      <Form onSubmit={() => pair.mutate(code)}>
        <Title>이 차를 연결할까요?</Title>
        <Lead>차 화면에 보이는 8자리 연결 코드예요.</Lead>
        <TextField code autoCapitalize="characters" autoComplete="off" enterKeyHint="go" aria-label="연결 코드"
          value={isCompletePairCode(code) ? formatPairCode(code) : typed} onChange={(event) => setTyped(event.target.value)} />
        {pair.isError ? <ProblemAlert title="연결하지 못했어요" body={pairErrorText(pair.error)} /> : null}
        <Dock>
          <Button type="submit" className="w-full" disabled={!isCompletePairCode(code) || pair.isPending}>
            {pair.isPending ? "연결 중…" : "연결"}
          </Button>
        </Dock>
      </Form>
    </Screen>
  );
};
