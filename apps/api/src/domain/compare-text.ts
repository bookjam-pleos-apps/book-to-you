// 코드 단위 순서다. 로캘 비교와 달리 실행 환경에 따라 결과가 달라지지 않는다.
export const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
