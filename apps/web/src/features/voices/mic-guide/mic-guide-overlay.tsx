import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState } from "react";

import { cn } from "../../../shared/lib/utils";
import "./mic-guide.css";
import { nextGuidePhase, type GuidePhase } from "./mic-guide";
import { MicGuideArt } from "./mic-guide-art";

// 재생 → 흐려짐 → 닫힘을 차례로 밟는다. 닫힘에 닿으면 onClose를 부른다.
const useGuidePhase = (onClose: () => void): GuidePhase => {
  const [phase, setPhase] = useState<GuidePhase>("playing");
  useEffect(() => {
    const step = nextGuidePhase(phase);
    if (step === null) {
      onClose();
      return;
    }
    const timer = setTimeout(() => setPhase(step.next), step.after);
    return () => clearTimeout(timer);
  }, [phase, onClose]);
  return phase;
};

// 녹음 화면 위를 덮는 모달 안내다. 모달이라 아래 화면은 키보드·화면 낭독기로도 닿지 않고, Esc로도 닫힌다.
// 화면 전체가 닫기 버튼이라 어디를 눌러도 닫히고, 그 탭은 아래 "녹음 시작"으로 가지 않는다.
export const MicGuideOverlay = ({ onClose }: { readonly onClose: () => void }) => {
  const phase = useGuidePhase(onClose);
  return (
    <Dialog.Root open onOpenChange={(next) => (next ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Popup className={cn("mic-guide fixed inset-0 z-50 bg-ink/75", phase === "fading" && "is-fading")}>
          <Dialog.Close className="absolute inset-0 size-full" aria-label="안내 닫기" />
          <div className="pointer-events-none relative flex h-full flex-col items-center justify-center gap-5 px-7 text-center text-surface">
            <MicGuideArt />
            <Dialog.Title className="text-slogan font-bold">
              입에서 한 뼘 떼고,
              <br />
              입 대각선 아래에 대 주세요
            </Dialog.Title>
            <Dialog.Description className="-mt-3 text-caption text-surface/70">입김이 마이크에 닿으면 잡음이 섞여요</Dialog.Description>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
