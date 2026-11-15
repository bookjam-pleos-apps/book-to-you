import { Navigate, useLocation, useNavigate, useParams } from "react-router";

import { readReturnPath } from "../../shared/routing/return-path";
import { Screen, TopBar } from "../../shared/ui/screen";
import { CodeStep } from "./code-step";
import { EmailStep } from "./email-step";
import { historyStateOf, pathOf, previousStage, stageOf, type LoginStage } from "./login-stage";
import { TermsStep } from "./terms-step";

const StageView = ({ stage, go, onSignedIn }: {
  readonly stage: LoginStage;
  readonly go: (stage: LoginStage) => void;
  readonly onSignedIn: () => void;
}) => {
  if (stage.kind === "terms") return <TermsStep onAgree={() => go({ kind: "email" })} />;
  if (stage.kind === "email") return <EmailStep onSent={(email) => go({ kind: "code", email })} />;
  return <CodeStep email={stage.email} onSignedIn={onSignedIn} />;
};

// 단계마다 주소를 쌓아 브라우저 뒤로 가기가 앞 단계로 간다. ?next=…(로그인 뒤 돌아갈 곳)는 단계를 옮겨도 유지한다.
export const LoginScreen = () => {
  const { step } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stage = stageOf(step, location.state);
  const go = (next: LoginStage, replace = false) => navigate(`${pathOf(next)}${location.search}`, { state: historyStateOf(next), replace });
  if (pathOf(stage) !== location.pathname) return <Navigate to={`${pathOf(stage)}${location.search}`} state={historyStateOf(stage)} replace />;
  // 이 앱 안에서 쌓인 기록이 있으면 브라우저 뒤로 가기와 같게, 바로 들어온 주소면 앞 단계로 바꿔 끼운다.
  const back = () => {
    const previous = previousStage(stage);
    if (previous === null) return void navigate("/");
    if (location.key !== "default") return void navigate(-1);
    go(previous, true);
  };
  return (
    <Screen>
      <TopBar title="로그인" onBack={back} />
      <StageView stage={stage} go={go} onSignedIn={() => navigate(readReturnPath(location.search), { replace: true })} />
    </Screen>
  );
};
