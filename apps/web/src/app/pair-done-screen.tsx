import { useNavigate } from "react-router";

import { useRenders } from "../features/library/library-api";
import { useVoices } from "../features/voices/voices-api";
import { HOME_PATH } from "../shared/routing/return-path";
import { Button } from "../shared/ui/button";
import { PendingLoads } from "../shared/ui/pending-loads";
import { Dock, Screen, TopBar } from "../shared/ui/screen";
import { Body, Title } from "../shared/ui/text";
import { afterPairing } from "./next-steps";

const PairNext = () => {
  const navigate = useNavigate();
  const voices = useVoices();
  const renders = useRenders();
  if (!voices.data || !renders.data) return <PendingLoads queries={[voices, renders]} />;
  const step = afterPairing(voices.data.voices, renders.data.renders);
  return (
    <>
      <Body>{step.body}</Body>
      <Dock>
        <Button className="w-full" onClick={() => navigate(step.action.path)}>
          {step.action.label}
        </Button>
      </Dock>
    </>
  );
};

export const PairDoneScreen = () => {
  const navigate = useNavigate();
  return (
    <Screen>
      <TopBar title="차 연결" onBack={() => navigate(HOME_PATH)} />
      <Title>차를 연결했어요</Title>
      <PairNext />
    </Screen>
  );
};
