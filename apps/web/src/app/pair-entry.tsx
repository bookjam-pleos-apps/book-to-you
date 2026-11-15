import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";

import { useAuthOptions, useSession } from "../features/auth/auth-api";
import { QuickStartScreen } from "../features/auth/quick-start-screen";
import { PAIR_DONE_PATH } from "../features/devices/devices-api";
import { readPairCode } from "../features/devices/pair-code";
import { PairScreen } from "../features/devices/pair-screen";
import { QUERY_KEYS } from "../shared/api-client/query-keys";
import { loginPathReturningTo } from "../shared/routing/return-path";
import { Loading } from "../shared/ui/controls";
import { Screen } from "../shared/ui/screen";
import { choosePairEntry } from "./pair-entry-choice";
import { RequireSession } from "./require-session";

const ConfirmPairing = () => (
  <RequireSession>
    <PairScreen />
  </RequireSession>
);

// 로그인하지 않은 휴대폰이 차 QR(/pair?code=…)로 들어오면 이메일 로그인 대신 바로 시작하기를 보여 준다.
export const PairEntry = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const options = useAuthOptions();
  const signedIn = session.data === undefined ? undefined : session.data !== null;
  const quickStart = options.isError ? false : options.data?.quickStart;
  const choice = choosePairEntry({ signedIn, code: readPairCode(location.search), quickStart });
  if (choice.kind === "loading") {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (choice.kind === "confirm") return <ConfirmPairing />;
  const onStarted = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.devices });
    navigate(PAIR_DONE_PATH, { replace: true });
  };
  const loginPath = options.data?.emailLogin ? loginPathReturningTo(`${location.pathname}${location.search}`) : null;
  return <QuickStartScreen userCode={choice.code} loginPath={loginPath} onStarted={onStarted} />;
};
