import { useNavigate } from "react-router";

import { HOME_PATH } from "../../shared/routing/return-path";
import { ProblemAlert } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { PendingLoads } from "../../shared/ui/pending-loads";
import { Dock } from "../../shared/ui/screen";
import { Notice } from "../../shared/ui/surfaces";
import { useRenders, useStories } from "./library-api";
import { storyListenPath } from "./library-paths";
import { canMake, renderOf, STATUS_TEXT } from "./shelf";
import { useStartMaking } from "./start-making";

export const useStoryTitle = (storyId: string): string | undefined =>
  useStories().data?.stories.find((story) => story.id === storyId)?.title;

// 다 만든 동화는 상태 글 대신 바로 들으러 가게 한다.
const ListenButton = ({ renderId }: { readonly renderId: string }) => {
  const navigate = useNavigate();
  return (
    <Button className="w-full" onClick={() => navigate(storyListenPath(renderId))}>
      듣기
    </Button>
  );
};

type MakeProps = { readonly storyId: string; readonly voiceId: string };

// 다 만든 동화는 듣기로 보내고, 만드는 중이면 상태만, 만들 수 있을 때만 만들기 버튼을 낸다.
// 상태 글은 본문에, 버튼만 화면 아래(Dock)에 둔다. 버튼 자리에 글 상자가 있으면 꺼진 버튼처럼 보인다.
export const MakeStory = ({ storyId, voiceId }: MakeProps) => {
  const navigate = useNavigate();
  const renders = useRenders();
  const making = useStartMaking(storyId, voiceId, () => navigate(HOME_PATH, { replace: true }));
  if (!renders.data) return <PendingLoads queries={[renders]} />;
  const made = renderOf(renders.data.renders, storyId, voiceId);
  if (made?.status === "playable") return <Dock><ListenButton renderId={made.renderId} /></Dock>;
  const status = made?.status ?? null;
  const offerMake = canMake(status) && making.failure?.retryable !== false;
  return (
    <>
      {status === null ? null : <Notice className="w-full text-center">{STATUS_TEXT[status]}</Notice>}
      {making.failure === null ? null : <ProblemAlert title="만들기를 시작하지 못했어요" body={making.failure.body} />}
      {offerMake ? (
        <Dock>
          <Button className="w-full" disabled={making.pending} onClick={making.start}>
            {status === "failed" ? "다시 만들기" : "이 목소리로 만들기"}
          </Button>
        </Dock>
      ) : null}
    </>
  );
};
