const HANGUL_SYLLABLE = /[가-힣]/g;
// 반각·전각 숫자와 라틴 문자, 한자, 괄호. 구연 스킬의 prepare_manuscript.py READING_RISKS와 같은 범위다.
const UNREADABLE_MARK = /[0-9０-９A-Za-zＡ-Ｚａ-ｚ一-鿿()（）[\]［］]+/g;

// spike의 count_syllables와 같은 규칙이다. 렌더러는 이 값으로 허용 길이와 토큰 예산을 정한다.
export const hangulSyllables = (text: string): number => text.match(HANGUL_SYLLABLE)?.length ?? 0;

// 이 표기들은 음절로 세지 않아 토큰 예산이 모자라고, 모델이 잘못 읽는다. 한글로 풀어 써야 한다.
export const unreadableMarks = (text: string): readonly string[] => text.match(UNREADABLE_MARK) ?? [];

export const isRenderableLine = (text: string, maxSyllables: number): boolean =>
  hangulSyllables(text) <= maxSyllables && unreadableMarks(text).length === 0;
