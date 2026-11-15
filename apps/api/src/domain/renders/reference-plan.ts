import { STYLES, type Style } from "@voice-storybook/shared/vocab";

import { resolveReferenceStyle } from "./reference-style";

export type StyledClip = { readonly id: string; readonly style: Style };

// 이야기의 style마다 어떤 참조 style로 읽을지. 렌더 작업 파일의 readAs로 그대로 나간다.
export type ReadAs = Readonly<Partial<Record<Style, Style>>>;

export type ReferenceRules = {
  // 녹음이 있어도 다른 참조로 읽게 하는 정책이다. 검증되지 않은 style(soft)을 calm으로 돌린다.
  readonly policyReadAs: ReadAs;
  // 운영자가 고른 참조 style. 없으면 통과한 녹음이 있는 style을 모두 쓴다.
  readonly onlyStyles?: ReadonlySet<Style> | undefined;
  // 운영자가 지정한 클립. 같은 style에 통과 녹음이 여럿일 때 하나를 고른다.
  readonly clipIds: readonly string[];
};

export type ReferencePlan<Clip extends StyledClip> =
  | { readonly kind: "planned"; readonly readAs: ReadAs; readonly clips: readonly Clip[] }
  | { readonly kind: "no_passed_clip" }
  | { readonly kind: "ambiguous_clip"; readonly style: Style };

const readAsFor = (lineStyles: readonly Style[], available: ReadonlySet<Style>, policy: ReadAs): ReadAs | null => {
  const styles = [...new Set(lineStyles)];
  const resolved = styles.flatMap((style) => {
    const target = resolveReferenceStyle(policy[style] ?? style, available);
    return target === null ? [] : [[style, target] as const];
  });
  return resolved.length === styles.length ? Object.fromEntries(resolved) : null;
};

const poolFor = <Clip extends StyledClip>(style: Style, usable: readonly Clip[], clipIds: readonly string[]): readonly Clip[] => {
  const candidates = usable.filter((clip) => clip.style === style);
  const named = candidates.filter((clip) => clipIds.includes(clip.id));
  return named.length > 0 ? named : candidates;
};

// 입력: 이야기 줄의 style, 통과한 녹음, 운영 규칙. 출력: 줄 style별 참조와 참조 style마다 클립 하나.
// 참조로 쓰는 style에 통과 녹음이 여럿이고 운영자가 고르지 않았으면 추측하지 않는다(동의 추적과 재현).
export const planReferences = <Clip extends StyledClip>(
  lineStyles: readonly Style[],
  passedClips: readonly Clip[],
  rules: ReferenceRules,
): ReferencePlan<Clip> => {
  const usable = passedClips.filter((clip) => rules.onlyStyles?.has(clip.style) ?? true);
  if (rules.clipIds.some((id) => !usable.some((clip) => clip.id === id))) return { kind: "no_passed_clip" };
  const readAs = readAsFor(lineStyles, new Set(usable.map((clip) => clip.style)), rules.policyReadAs);
  if (readAs === null) return { kind: "no_passed_clip" };
  const used = STYLES.filter((style) => Object.values(readAs).includes(style));
  const pools = used.map((style) => ({ style, pool: poolFor(style, usable, rules.clipIds) }));
  const ambiguous = pools.find(({ pool }) => pool.length !== 1);
  if (ambiguous !== undefined) return { kind: "ambiguous_clip", style: ambiguous.style };
  return { kind: "planned", readAs, clips: pools.flatMap(({ pool }) => pool) };
};
