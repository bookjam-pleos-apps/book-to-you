// 앞의 것이 끝난 뒤에 다음을 시작한다. 순서에 뜻이 있을 때만 쓴다(대기열 상한, 한 대뿐인 장비, 앞 결과에 따라 달라지는 판정).
// step은 지금까지의 결과(사본)를 함께 받는다. 차례로 기다리는 반복은 여기 한 곳에만 둔다.
export const mapInSequence = async <Item, Result>(
  items: readonly Item[],
  step: (item: Item, done: readonly Result[]) => Promise<Result>,
): Promise<readonly Result[]> => {
  const done: Result[] = [];
  for (const item of items) done.push(await step(item, [...done]));
  return done;
};
