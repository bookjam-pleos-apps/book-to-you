import { Link } from "react-router";

import { ChevronIcon } from "./icons";

type LinkNoticeProps = { readonly to: string; readonly title: string; readonly body?: string };

// 할 일을 알리는 카드다. 주 버튼과 겹치지 않게 주황 없이 카드 전체를 누르게 한다.
export const LinkNotice = ({ to, title, body }: LinkNoticeProps) => (
  <Link to={to} className="flex min-h-11 items-center gap-3 rounded-card bg-surface px-4 py-3.5">
    <span className="flex flex-1 flex-col gap-0.5">
      <span className="text-label font-bold">{title}</span>
      {body === undefined ? null : <span className="text-caption text-ink-3">{body}</span>}
    </span>
    <ChevronIcon className="size-5 shrink-0 text-ink-3" />
  </Link>
);
