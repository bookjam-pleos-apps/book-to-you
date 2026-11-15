// 시연 서버의 공유 책장 규칙 한 곳. 시연 계정 자신에게는 그대로, 다른 계정에는 내 것 뒤에 시연 계정 것을 붙인다.
// 무엇을 붙일지(keep)는 부르는 쪽이 정한다(차 manifest는 전부, 부모 웹 목록은 게시된 것만).
export const appendSharedOwner = async <Item>(
  userId: string,
  sharedOwnerId: string,
  load: (ownerId: string) => Promise<readonly Item[]>,
  keep: (shared: readonly Item[]) => readonly Item[],
): Promise<readonly Item[]> => {
  if (userId === sharedOwnerId) return load(userId);
  const [own, shared] = await Promise.all([load(userId), load(sharedOwnerId)]);
  return [...own, ...keep(shared)];
};
