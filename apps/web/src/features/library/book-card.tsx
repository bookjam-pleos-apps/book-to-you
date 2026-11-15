import type { ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "../../shared/lib/utils";
import { StoryCover } from "./story-cover";

type BookCardProps = {
  readonly storyId: string;
  readonly title: string;
  // 화면의 제목 구조에 맞춘다. 동화 고르기는 h2, 홈 선반 안의 책은 h3다.
  readonly level?: "h2" | "h3";
  // 이상할 때만 제목 아래에 한 줄로 보인다(만드는 중, 실패). 정상이면 비운다.
  readonly state?: ReactNode;
  readonly dim?: boolean;
  // 갈 곳이 있는 책이다. 아직 갈 수 없는 책(만드는 중)은 onPress로 안내를 띄운다.
  readonly to?: string;
  readonly onPress?: () => void;
};

const BookFace = ({ storyId, title, level: Title = "h2", state, dim = false }: Omit<BookCardProps, "to" | "onPress">) => (
  <>
    <StoryCover storyId={storyId} shape="landscape" dim={dim} />
    <div className="flex flex-col items-center">
      <Title className="text-center text-caption font-bold">{title}</Title>
      {state}
    </div>
  </>
);

const BOOK = "flex flex-col gap-1.5";

const BookBody = ({ to, onPress, ...face }: BookCardProps) => {
  if (to !== undefined) return <Link to={to} className={BOOK}><BookFace {...face} /></Link>;
  if (onPress === undefined) return <div className={BOOK}><BookFace {...face} /></div>;
  // 제목(h2·h3)을 버튼 안에 넣지 않으려고 누르는 자리를 책 위에 덮는다.
  return (
    <div className={cn(BOOK, "relative")}>
      <BookFace {...face} />
      <button type="button" className="absolute inset-0 rounded-card" aria-label={`${face.title} 안내`} onClick={onPress} />
    </div>
  );
};

// 차량 책장처럼 표지 아래에 제목을 둔다.
export const BookCard = (props: BookCardProps) => (
  <li>
    <BookBody {...props} />
  </li>
);

export const BookGrid = ({ children }: { readonly children: ReactNode }) => <ul className="grid grid-cols-2 gap-3">{children}</ul>;
