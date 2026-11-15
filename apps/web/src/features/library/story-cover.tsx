import { cn } from "../../shared/lib/utils";
import { coverOf, type CoverShape, type CoverTone } from "./cover";
import { COVER_ART } from "./cover-art";

const TONE_CLASS: Readonly<Record<CoverTone, string>> = {
  red: "bg-cover-red",
  sea: "bg-cover-sea",
  mint: "bg-cover-mint",
};

const SHAPE_CLASS: Readonly<Record<CoverShape, string>> = {
  portrait: "aspect-3/4",
  landscape: "aspect-video",
};

type StoryCoverProps = {
  readonly storyId: string;
  readonly shape: CoverShape;
  // 원하는 비율 그림이 없으면 다른 비율로 그린다. 그때 크기도 달라야 해서 실제로 그린 비율에 맞춰 클래스를 고른다.
  readonly sizeByShape?: Partial<Record<CoverShape, string>>;
  // 만드는 중이거나 실패한 책은 표지를 흐리게 둔다. 들을 수 있는 책만 선명하다.
  readonly dim?: boolean;
};

// 차량 책장의 표지 카드처럼 흰 테와 그림자를 두른다. 표지는 장식이라 화면 낭독기는 제목만 읽는다.
export const StoryCover = ({ storyId, shape, sizeByShape = {}, dim = false }: StoryCoverProps) => {
  const cover = coverOf(COVER_ART, storyId, shape);
  const drawnShape = cover.art?.shape ?? shape;
  return (
    <div className={cn("overflow-hidden rounded-card bg-surface p-1 shadow-button", SHAPE_CLASS[drawnShape], sizeByShape[drawnShape])} aria-hidden="true">
      {cover.art === null ? (
        <div className={cn("size-full rounded-md", TONE_CLASS[cover.tone], dim && "opacity-40")} />
      ) : (
        <img src={cover.art.src} alt="" className={cn("size-full rounded-md object-cover", dim && "opacity-40")} />
      )}
    </div>
  );
};
