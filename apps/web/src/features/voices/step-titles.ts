import type { Style } from "@voice-storybook/shared/vocab";

export const STEP_TITLES: Record<Style | "belt", string> = {
  calm: "차분한 목소리",
  excited: "신나는 목소리",
  soft: "작은 목소리",
  deep: "낮고 굵은 목소리",
  child: "아이 목소리",
  belt: "벨트 안내",
};

export const optionalStepTitle = (style: Style): string => `${STEP_TITLES[style]} (선택)`;
