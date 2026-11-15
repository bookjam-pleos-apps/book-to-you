import type { Render, VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { useNavigate } from "react-router";

import { PAIR_PATH, useDevices } from "../features/devices/devices-api";
import { useRenders } from "../features/library/library-api";
import { NEW_VOICE_PATH } from "../features/voices/voice-paths";
import { useVoices } from "../features/voices/voices-api";
import { Button } from "../shared/ui/button";
import { TextLink } from "../shared/ui/controls";
import { IconButton } from "../shared/ui/icon-button";
import { PersonIcon } from "../shared/ui/icons";
import { LinkNotice } from "../shared/ui/link-notice";
import { PendingLoads } from "../shared/ui/pending-loads";
import { Dock, Screen, TopBar } from "../shared/ui/screen";
import { Body, Title } from "../shared/ui/text";
import { HomeShelfSection } from "./home-shelf";
import { homePrimaryAction, homeShelvesOf, isFirstVisit, showsPairNotice } from "./home-shelves";

export const ACCOUNT_PATH = "/account";

const AccountButton = () => {
  const navigate = useNavigate();
  return (
    <IconButton label="내 정보" onClick={() => navigate(ACCOUNT_PATH)}>
      <PersonIcon className="size-6" />
    </IconButton>
  );
};

const PrimaryDock = ({ voices }: { readonly voices: readonly VoiceResponse[] }) => {
  const navigate = useNavigate();
  const action = homePrimaryAction(voices);
  if (action === null) return null;
  return (
    <Dock>
      <Button className="w-full" onClick={() => navigate(action.path)}>
        {action.label}
      </Button>
    </Dock>
  );
};

const FirstVisit = () => (
  <>
    <Title>내 목소리로 동화를 들려주세요</Title>
    <Body>목소리를 한 번 녹음하면 동화를 몇 편이든 만들 수 있어요.</Body>
  </>
);

type ShelvesProps = { readonly voices: readonly VoiceResponse[]; readonly renders: readonly Render[] | undefined };

// 동화 목록이 실패해도 목소리 선반과 녹음 진입은 보인다. 동화 목록 상태는 선반 위에 한 번만 알린다.
const Shelves = ({ voices, renders }: ShelvesProps) => {
  const navigate = useNavigate();
  const devices = useDevices();
  const shelves = homeShelvesOf(voices, renders ?? []);
  return (
    <>
      {renders !== undefined && isFirstVisit(voices, renders) ? <FirstVisit /> : null}
      {showsPairNotice(voices, devices.data?.devices.length) ? <LinkNotice to={PAIR_PATH} title="차와 아직 연결하지 않았어요" /> : null}
      {shelves.map((shelf) => <HomeShelfSection key={shelf.voiceId} shelf={shelf} booksLoaded={renders !== undefined} />)}
      {voices.length === 0 ? null : <TextLink onClick={() => navigate(NEW_VOICE_PATH)}>목소리 추가하기</TextLink>}
    </>
  );
};

const HomeBody = () => {
  const voices = useVoices();
  const renders = useRenders();
  if (!voices.data) return <PendingLoads queries={[voices]} />;
  return (
    <>
      {renders.data ? null : <PendingLoads queries={[renders]} />}
      <Shelves voices={voices.data.voices} renders={renders.data?.renders} />
      <PrimaryDock voices={voices.data.voices} />
    </>
  );
};

export const HomeScreen = () => (
  <Screen>
    <TopBar title="BOOK TO YOU" heading trailing={<AccountButton />} />
    <HomeBody />
  </Screen>
);
