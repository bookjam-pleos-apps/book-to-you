import { Navigate, useNavigate } from "react-router";

import logoWordmark from "../../assets/brand/logo-wordmark.svg";
import mascot from "../../assets/brand/mascot.svg";
import { Button } from "../../shared/ui/button";
import { Dock, Screen } from "../../shared/ui/screen";
import { HOME_PATH } from "../../shared/routing/return-path";
import { useSession } from "./auth-api";

// 주황 바탕 위 글자는 대비 때문에 흰색이 아니라 ink로 쓴다(revision.md).
export const StartScreen = () => {
  const navigate = useNavigate();
  const session = useSession();
  if (session.data) return <Navigate to={HOME_PATH} replace />;
  return (
    <div className="bg-brand">
      <Screen className="items-center px-6 pt-20 pb-16 text-center">
        <img src={mascot} alt="" className="h-auto w-mascot" />
        <h1 className="mt-2">
          <img src={logoWordmark} alt="BOOK TO YOU" className="h-auto w-wordmark" />
        </h1>
        <p className="mt-2 text-slogan font-semibold">가장 사랑하는 목소리로, 너에게.</p>
        <p className="-mt-3 max-w-[16rem] text-caption text-ink">엄마 아빠 목소리로 만든 동화를 차에서 아이에게 들려줘요.</p>
        <Dock>
          <Button variant="light" size="cta" className="w-full max-w-cta" onClick={() => navigate("/login")}>
            시작하기
          </Button>
        </Dock>
      </Screen>
    </div>
  );
};
