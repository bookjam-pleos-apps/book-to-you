import { useNavigate } from "react-router";

import { useDeleteAccount } from "../features/auth/account-actions";
import { useSession } from "../features/auth/auth-api";
import { LogoutButton } from "../features/auth/logout-button";
import { DeviceList } from "../features/devices/device-list";
import { HOME_PATH } from "../shared/routing/return-path";
import { ConfirmDelete } from "../shared/ui/confirm-delete";
import { Dock, Screen, TopBar } from "../shared/ui/screen";
import { Card } from "../shared/ui/surfaces";

const DeleteAccount = () => {
  const remove = useDeleteAccount();
  return (
    <ConfirmDelete label="계정과 모든 데이터 지우기" title="계정을 지울까요?" body="녹음한 목소리와 만든 동화가 모두 지워져요. 되돌릴 수 없어요."
      remove={remove} />
  );
};

const AccountCard = ({ email, emailless }: { readonly email: string; readonly emailless: boolean }) => {
  if (!emailless) {
    return (
      <Card className="gap-1">
        <span className="text-label font-bold break-all">{email}</span>
      </Card>
    );
  }
  return (
    <Card className="gap-1">
      <span className="text-label font-bold">이메일 없이 시작한 계정</span>
      <span className="text-caption text-ink-3">이 휴대폰 브라우저에서만 열려요. 브라우저 데이터를 지우면 다시 들어올 수 없어요.</span>
    </Card>
  );
};

// 계정(auth)과 연결된 차(devices)를 함께 쓰는 화면이라 app에 둔다.
export const AccountScreen = () => {
  const navigate = useNavigate();
  const session = useSession();
  // 이메일 없이 시작한 계정은 로그아웃하면 다시 들어올 길이 없어 로그아웃을 두지 않는다.
  const emailless = session.data?.emailless ?? false;
  return (
    <Screen>
      <TopBar title="내 정보" heading onBack={() => navigate(HOME_PATH)} />
      <AccountCard email={session.data?.email ?? ""} emailless={emailless} />
      <DeviceList />
      <Dock>
        {emailless ? null : <LogoutButton />}
        <DeleteAccount />
      </Dock>
    </Screen>
  );
};
