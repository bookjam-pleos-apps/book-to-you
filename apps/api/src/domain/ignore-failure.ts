// 실패해도 다른 경로(리컨실러, 고아 정리)가 다시 처리하는 호출에만 쓴다.
export const ignoreFailure = (): undefined => undefined;
