// 받아쓰기와 원문의 글자 오류율 상한. 녹음 확인(apps/api verify)과 렌더 문장 QC(gpu/spike render_qc.MAX_CER)가 같은 값을 쓴다.
// 실제 녹음으로 잰 값이 아니라 잠정값이다. 바꾸면 test_qc_parity가 스파이크 쪽도 함께 바꾸게 한다.
export const MAX_SCRIPT_ERROR_RATE = 0.2;
