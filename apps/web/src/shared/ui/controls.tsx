import type { ReactNode } from "react";

import { cn } from "../lib/utils";

type CheckProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: ReactNode;
};

export const Check = ({ checked, onChange, children }: CheckProps) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-card bg-surface p-4 text-base/6">
    <input
      type="checkbox"
      className="mt-0.5 size-5 shrink-0 accent-brand"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{children}</span>
  </label>
);

type TextLinkProps = {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  // danger는 되돌릴 수 없는 동작(지우기)이다. 눈에 덜 띄는 자리에 빨간 글자로 둔다.
  readonly tone?: "default" | "danger";
};

export const TextLink = ({ children, onClick, disabled = false, tone = "default" }: TextLinkProps) => (
  <button
    type="button"
    className={cn(
      "min-h-11 self-center px-3 text-caption font-bold underline underline-offset-4 disabled:opacity-40",
      tone === "danger" ? "text-danger-text" : "text-ink-2",
    )}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

// 화면 일부를 불러오지 못했을 때다. 화면 전체가 막히는 연결 오류는 RequireSession이 맡는다.
export const LoadFailed = ({ onRetry }: { readonly onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-1 rounded-card bg-surface p-4">
    <p className="text-center text-caption text-ink-2">불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</p>
    <TextLink onClick={onRetry}>다시 시도</TextLink>
  </div>
);

export const Loading = () => (
  <p role="status" className="text-center text-caption-sm text-ink-3">
    불러오는 중…
  </p>
);
