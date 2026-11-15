import type { RenderDetail } from "@voice-storybook/shared/contracts/v1";
import { Navigate, useNavigate, useParams } from "react-router";

import { failureStatus } from "../../shared/api-client/api-error";
import { HOME_PATH } from "../../shared/routing/return-path";
import { ProblemAlert } from "../../shared/ui/alert";
import { Badge } from "../../shared/ui/badge";
import { PendingLoads } from "../../shared/ui/pending-loads";
import { Dock, Screen, TopBar } from "../../shared/ui/screen";
import { Notice } from "../../shared/ui/surfaces";
import { Title } from "../../shared/ui/text";
import { useRender } from "./library-api";
import { RemakeButton } from "./remake-button";
import { ReportMenu } from "./report-menu";
import { chaptersInOrder, STATUS_TEXT } from "./shelf";
import { useStartMaking } from "./start-making";
import { StoryCover } from "./story-cover";
import { StoryPlayer } from "./story-player";

// 실패한 동화는 책장(홈)에서 눌러 여기서 다시 만든다. 시작하면 홈으로 돌아가 진행을 본다.
const FailedListen = ({ render }: { readonly render: RenderDetail }) => {
  const navigate = useNavigate();
  const making = useStartMaking(render.storyId, render.voiceId, () => navigate(HOME_PATH, { replace: true }));
  return (
    <>
      <Notice className="w-full text-center">{STATUS_TEXT.failed}</Notice>
      {making.failure === null ? null : <ProblemAlert title="만들기를 시작하지 못했어요" body={making.failure.body} />}
      <Dock>
        <RemakeButton making={making} />
      </Dock>
    </>
  );
};

// 만든 동화를 차에 가기 전에 들어 본다. 아직 만들지 못했으면 상태만 보인다.
const Listen = ({ render }: { readonly render: RenderDetail }) => {
  const chapters = chaptersInOrder(render);
  if (render.status === "failed") return <FailedListen render={render} />;
  if (chapters.length === 0) return <Notice className="w-full text-center">{STATUS_TEXT[render.status]}</Notice>;
  // 다른 동화로 바로 옮겨 가도 장 번호가 따라가지 않게 동화마다 새로 둔다.
  return <StoryPlayer key={render.renderId} chapters={chapters} />;
};

// 없는 렌더(404)만 홈으로 돌려보낸다. 터널이 잠깐 끊긴 것 같은 실패는 다시 받을 수 있게 둔다.
const ListenBody = ({ renderId }: { readonly renderId: string }) => {
  const navigate = useNavigate();
  const render = useRender(renderId);
  if (failureStatus(render.error) === 404) return <Navigate to={HOME_PATH} replace />;
  // 상단 막대를 데이터보다 먼저 그린다. 받는 중이거나 실패해도 홈으로 돌아갈 수 있어야 한다.
  if (!render.data) return <><TopBar onBack={() => navigate(HOME_PATH)} /><PendingLoads queries={[render]} /></>;
  return (
    <>
      <TopBar onBack={() => navigate(HOME_PATH)} trailing={<ReportMenu render={render.data} />} />
      <StoryCover storyId={render.data.storyId} shape="landscape" />
      <Badge className="self-start">{render.data.voiceLabel} 목소리</Badge>
      <Title>{render.data.title}</Title>
      <Listen render={render.data} />
    </>
  );
};

export const StoryListenScreen = () => {
  const { renderId } = useParams();
  if (renderId === undefined) return <Navigate to={HOME_PATH} replace />;
  return (
    <Screen>
      <ListenBody renderId={renderId} />
    </Screen>
  );
};
