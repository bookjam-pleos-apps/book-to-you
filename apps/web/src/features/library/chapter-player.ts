// 듣기 화면 플레이어의 판단이다. 차량 앱 재생 화면처럼 장 단위로 넘기고, 장마다 진행 칸 하나를 둔다.

// 장 칸마다 얼마나 찼는지(0~1)다. 들은 장은 1, 듣는 장은 들은 만큼, 남은 장은 0이다.
export const segmentFills = (total: number, index: number, positionMs: number, durationMs: number): readonly number[] => {
  const current = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  return Array.from({ length: total }, (_, i) => {
    if (i < index) return 1;
    return i === index ? current : 0;
  });
};

// 첫 장의 이전, 마지막 장의 다음은 없다(null). 버튼은 흐리게 막는다.
export const previousChapter = (index: number): number | null => (index > 0 ? index - 1 : null);

export const nextChapter = (index: number, total: number): number | null => (index + 1 < total ? index + 1 : null);

// 장 번호는 사람에게 1부터 보인다.
export const chapterTitle = (index: number): string => `제${index + 1}장`;

// 장 제목이 있으면 차량 재생 화면처럼 "제n장. 제목"으로 붙인다.
export const chapterHeading = (index: number, title: string | null): string =>
  title === null ? chapterTitle(index) : `${chapterTitle(index)}. ${title}`;

export const chapterCount = (index: number, total: number): string => `${index + 1} / ${total}`;

// 마지막 장까지 다 들은 뒤 "듣기"를 누르면 제1장부터 다시 튼다(마지막 장만 다시 나오지 않게).
export const toggleAction = (finished: boolean): "restart" | "toggle" => (finished ? "restart" : "toggle");
