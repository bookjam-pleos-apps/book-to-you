import type { Render } from "@voice-storybook/shared/contracts/v1";
import { useState } from "react";
import { Link } from "react-router";

import { BookCard, BookGrid } from "../features/library/book-card";
import { storyListenPath } from "../features/library/library-paths";
import { BOOK_STATE_TEXT, bookTapOf, MAKING_LEAVE_NOTICE } from "../features/library/shelf";
import type { VoiceTodo } from "../features/voices/manage/voice-card-view";
import { voiceDetailPath } from "../features/voices/voice-paths";
import { CHECKING_TEXT, remainingRecordingText } from "../features/voices/manage/voice-todo-text";
import { cn } from "../shared/lib/utils";
import { Badge } from "../shared/ui/badge";
import { ChevronIcon } from "../shared/ui/icons";
import { LinkNotice } from "../shared/ui/link-notice";
import { NoticeDialog } from "../shared/ui/notice-dialog";
import { Notice } from "../shared/ui/surfaces";
import type { HomeShelf } from "./home-shelves";

const BookState = ({ status }: { readonly status: Render["status"] }) => {
  if (status === "playable") return null;
  const failed = status === "failed";
  return <span className={cn("text-center text-caption-sm", failed ? "font-bold text-danger-text" : "text-ink-3")}>{BOOK_STATE_TEXT[status]}</span>;
};

// 만드는 중인 책은 아직 들을 수 없어 누르면 떠나도 된다고 알린다. 실패한 책은 듣기 화면에서 다시 만든다(주 버튼).
const RenderBook = ({ render }: { readonly render: Render }) => {
  const [noticeOpen, setNoticeOpen] = useState(false);
  const tap = bookTapOf(render);
  const press = tap.kind === "open" ? { to: storyListenPath(tap.renderId) } : { onPress: () => setNoticeOpen(true) };
  return (
    <>
      <BookCard storyId={render.storyId} title={render.title} level="h3" dim={render.status !== "playable"} state={<BookState status={render.status} />} {...press} />
      <NoticeDialog open={noticeOpen && tap.kind === "notice"} {...MAKING_LEAVE_NOTICE} onClose={() => setNoticeOpen(false)} />
    </>
  );
};

const HEADER = "flex min-h-11 items-center gap-2 text-lg/6 font-bold";

// 선반 제목이 목소리 화면으로 가는 입구다. 듣기만 하는 선반은 갈 곳이 없어 글로만 둔다.
const ShelfHeader = ({ shelf }: { readonly shelf: HomeShelf }) => {
  const name = `${shelf.voiceLabel} 목소리`;
  if (shelf.listenOnly) return <h2 className={HEADER}>{name}</h2>;
  return (
    <h2>
      <Link to={voiceDetailPath(shelf.voiceId)} className={HEADER}>
        {name}
        {shelf.showsDefaultBadge ? <Badge>대표</Badge> : null}
        <ChevronIcon className="ml-auto size-5 text-ink-3" />
      </Link>
    </h2>
  );
};

const TodoNotice = ({ todo, voiceLabel }: { readonly todo: VoiceTodo; readonly voiceLabel: string }) => {
  if (todo.kind === "checking") return <Notice>{CHECKING_TEXT[todo.next]}</Notice>;
  return <LinkNotice to={todo.path} title={remainingRecordingText(todo.remaining)} body={`마치면 ${voiceLabel} 목소리로 동화를 만들 수 있어요`} />;
};

// 동화 목록을 아직 못 받았으면(받는 중, 실패) 책 자리를 비워 둔다. 알림은 홈 위쪽에 한 번만 보인다.
const ShelfBooks = ({ shelf, booksLoaded }: { readonly shelf: HomeShelf; readonly booksLoaded: boolean }) => {
  if (!booksLoaded) return null;
  if (shelf.renders.length === 0) return shelf.todo === null ? <p className="text-caption text-ink-3">아직 만든 동화가 없어요</p> : null;
  return <BookGrid>{shelf.renders.map((render) => <RenderBook key={render.renderId} render={render} />)}</BookGrid>;
};

export const HomeShelfSection = ({ shelf, booksLoaded }: { readonly shelf: HomeShelf; readonly booksLoaded: boolean }) => (
  <section className="flex flex-col gap-3">
    <ShelfHeader shelf={shelf} />
    {shelf.todo === null ? null : <TodoNotice todo={shelf.todo} voiceLabel={shelf.voiceLabel} />}
    <ShelfBooks shelf={shelf} booksLoaded={booksLoaded} />
  </section>
);
