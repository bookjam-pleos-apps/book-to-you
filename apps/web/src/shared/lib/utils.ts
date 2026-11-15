import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// theme.css의 --text-* 이름이다. tailwind-merge는 모르는 text-* 를 글자색으로 보고
// text-on-button-brand 같은 색 클래스를 지운다. 글자 크기 그룹에 알려 둔다.
const TEXT_SIZE_TOKENS = [
  "title", "timer", "slogan", "cta", "script", "app-bar", "label", "button", "caption", "caption-sm", "chip",
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...TEXT_SIZE_TOKENS] }] } },
});

// shadcn 컴포넌트가 쓰는 클래스 합치기다. 뒤에 온 Tailwind 클래스가 앞의 같은 속성을 이긴다.
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
