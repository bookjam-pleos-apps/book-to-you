import { Button } from "../../shared/ui/button";
import type { StartMaking } from "./start-making";

// 실패한 동화를 같은 목소리로 다시 만든다. 그 화면의 주 버튼이다.
// 다시 눌러도 안 되는 이유면 안내만 남기고 버튼을 숨긴다.
export const RemakeButton = ({ making }: { readonly making: StartMaking }) => {
  if (making.failure?.retryable === false) return null;
  return (
    <Button className="w-full" disabled={making.pending || making.started} onClick={making.start}>
      다시 만들기
    </Button>
  );
};
