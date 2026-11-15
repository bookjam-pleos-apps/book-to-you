import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { useSession } from "../features/auth/auth-api";
import { loginPathReturningTo } from "../shared/routing/return-path";
import { Button } from "../shared/ui/button";
import { Loading } from "../shared/ui/controls";
import { Dock, Screen } from "../shared/ui/screen";
import { Body, Title } from "../shared/ui/text";

// 401만 로그아웃으로 본다(useSession이 null로 바꾼다). 서버 오류나 끊김을 로그인 화면으로 보내면 로그인이 풀린 것처럼 보인다.
const SessionUnavailable = ({ onRetry }: { readonly onRetry: () => void }) => (
  <Screen>
    <Title>잠시 연결이 안 돼요</Title>
    <Body>인터넷 연결을 확인하고 다시 시도해 주세요.</Body>
    <Dock>
      <Button className="w-full" onClick={onRetry}>
        다시 시도
      </Button>
    </Dock>
  </Screen>
);

// 로그인 전에 /pair?code=…로 들어오면 코드를 들고 로그인으로 갔다가 돌아온다.
export const RequireSession = ({ children }: { readonly children: ReactNode }) => {
  const location = useLocation();
  const session = useSession();
  if (session.isError) return <SessionUnavailable onRetry={() => void session.refetch()} />;
  if (session.isPending) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (session.data === null) return <Navigate to={loginPathReturningTo(`${location.pathname}${location.search}`)} replace />;
  return children;
};
