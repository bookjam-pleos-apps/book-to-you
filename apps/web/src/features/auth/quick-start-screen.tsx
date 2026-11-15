import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { failureCode } from "../../shared/api-client/api-error";
import { isLoadFailed } from "../../shared/api-client/load-state";
import { QUERY_KEYS } from "../../shared/api-client/query-keys";
import type { Terms } from "../../shared/api-client/terms";
import { ProblemAlert } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { LoadFailed, TextLink } from "../../shared/ui/controls";
import { Dock, Screen, TopBar } from "../../shared/ui/screen";
import { Hint, Lead, Title } from "../../shared/ui/text";
import { AgreementChecks, useAgreements } from "./agreement-checks";
import { quickStart } from "./auth-api";
import { quickStartErrorText } from "./quick-start-errors";
import { useSignIn } from "./use-sign-in";

type QuickStartScreenProps = {
  readonly userCode: string;
  // null이면 이메일 로그인이 꺼진 배포라 링크를 보이지 않는다.
  readonly loginPath: string | null;
  readonly onStarted: () => void;
};

// 다른 탭에서 로그인해 세션 캐시가 낡았으면 서버가 409로 거부한다. 내 정보를 다시 받아 연결 확인 화면으로 넘어간다.
const useQuickStart = (userCode: string, onStarted: () => void) => {
  const queryClient = useQueryClient();
  const { signIn, terms } = useSignIn((_: void, current: Terms) => quickStart(userCode, current), onStarted);
  const start = () =>
    signIn.mutate(undefined, {
      onError: (error) => {
        if (failureCode(error) === "already_signed_in") void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
      },
    });
  return { signIn, terms, start };
};

// 차 QR로 들어온 로그인 전 휴대폰. 이메일 없이 계정을 만들고 그 차를 바로 잇는다.
export const QuickStartScreen = ({ userCode, loginPath, onStarted }: QuickStartScreenProps) => {
  const navigate = useNavigate();
  const agreements = useAgreements();
  const { signIn, terms, start } = useQuickStart(userCode, onStarted);
  return (
    <Screen>
      <TopBar title="차 연결" onBack={() => navigate("/")} />
      <Title>이 차로 바로 시작할까요?</Title>
      <Lead>이메일 없이 시작해요. 이 휴대폰에서 목소리를 녹음하고 동화를 만들 수 있어요.</Lead>
      <AgreementChecks {...agreements} />
      {signIn.isError ? <ProblemAlert title="시작하지 못했어요" body={quickStartErrorText(signIn.error)} /> : null}
      {isLoadFailed(terms) ? <LoadFailed onRetry={() => void terms.refetch()} /> : null}
      <Hint>이메일 없이 만든 계정은 이 휴대폰 브라우저에서만 열려요.</Hint>
      <Dock>
        <Button className="w-full" disabled={!agreements.allAgreed || terms.data === undefined || signIn.isPending} onClick={start}>
          {signIn.isPending ? "시작하는 중…" : "바로 시작하기"}
        </Button>
        {loginPath === null ? null : <TextLink onClick={() => navigate(loginPath)}>이메일 계정으로 로그인</TextLink>}
      </Dock>
    </Screen>
  );
};
