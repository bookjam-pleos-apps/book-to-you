// 오디오 주소를 한 곳에서 만든다. 책장(manifest)과 렌더 상세가 같은 주소를 준다.
export const audioUrlOf = (id: string): string => `/v1/audio/${id}`;
