import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { IconButton } from "./icon-button";
import { BackIcon } from "./icons";

export type StepProgress = { readonly current: number; readonly total: number };

type TopBarProps = {
  // 화면에 큰 제목이 따로 있으면 비운다. 같은 말을 두 번 보이지 않는다.
  readonly title?: string;
  // 화면에 큰 제목(Title)이 없으면 이 제목이 화면의 h1이 된다. 화면 낭독기가 화면 이름을 읽게 한다.
  readonly heading?: boolean;
  readonly onBack?: () => void;
  readonly progress?: StepProgress | undefined;
  // 오른쪽 끝에 두는 아이콘 버튼 자리다(내 정보, 더 보기).
  readonly trailing?: ReactNode;
};

// 단계는 막대 하나로만 보인다("2 / 6" 배지는 같은 뜻이라 뺐다). 화면 낭독에는 글로 읽힌다.
const StepBars = ({ current, total }: StepProgress) => (
  <div>
    <span className="sr-only">{`${total}단계 중 ${current}단계`}</span>
    <div className="flex gap-px" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < current ? "bg-brand" : "bg-fill-strong")} />
      ))}
    </div>
  </div>
);

const BackButton = ({ onBack }: { readonly onBack: () => void }) => (
  <IconButton label="뒤로" className="-ml-2.5" onClick={onBack}>
    <BackIcon className="size-6" />
  </IconButton>
);

const BarTitle = ({ title, heading }: { readonly title: string; readonly heading: boolean }) => {
  const Tag = heading ? "h1" : "span";
  return <Tag className="text-app-bar font-semibold">{title}</Tag>;
};

export const TopBar = ({ title, onBack, progress, trailing, heading = false }: TopBarProps) => (
  <header className="flex flex-col gap-3">
    <div className="flex h-12 items-center gap-1">
      {onBack === undefined ? null : <BackButton onBack={onBack} />}
      {title === undefined ? null : <BarTitle title={title} heading={heading} />}
      {trailing === undefined ? null : <div className="-mr-2.5 ml-auto">{trailing}</div>}
    </div>
    {progress === undefined ? null : <StepBars {...progress} />}
  </header>
);

export const Screen = ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => (
  <main className={cn("mx-auto flex min-h-dvh w-full max-w-screen-phone flex-col gap-4 px-6 pt-2 pb-7", className)}>{children}</main>
);

// 화면 아래에 붙는 버튼 자리다. 위 내용이 짧아도 아래로 밀린다.
export const Dock = ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => (
  <div className={cn("mt-auto flex w-full flex-col items-center gap-3 pt-4", className)}>{children}</div>
);
