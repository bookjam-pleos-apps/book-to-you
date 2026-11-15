import type { SVGProps } from "react";

// 아이콘은 currentColor를 따른다. 주 버튼 위 아이콘은 on-button-brand 토큰 색이 된다.
type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

const iconBase = { "aria-hidden": true, focusable: false, fill: "none" } as const;

export const MicIcon = (props: IconProps) => (
  <svg viewBox="0 0 48 48" {...iconBase} stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M24 31C28.42 31 32 27.42 32 23V12C32 7.58 28.42 4 24 4C19.58 4 16 7.58 16 12V23C16 27.42 19.58 31 24 31Z" />
    <path d="M8.7 19.3V22.7C8.7 31.14 15.56 38 24 38C32.44 38 39.3 31.14 39.3 22.7V19.3" />
    <path d="M21.22 12.86C23.02 12.2 24.98 12.2 26.78 12.86" />
    <path d="M22.4 17.1C23.46 16.82 24.56 16.82 25.62 17.1" />
    <path d="M24 38V44" />
  </svg>
);

export const PlayIcon = (props: IconProps) => (
  <svg viewBox="0 0 52 52" {...iconBase} {...props}>
    <path
      fill="currentColor"
      d="M10 11.11C10 10.39 10.19 9.68 10.54 9.05C10.89 8.43 11.4 7.91 12.01 7.55C12.62 7.19 13.31 7 14.01 7C14.72 7 15.41 7.2 16.02 7.56L40.01 21.94C40.61 22.31 41.12 22.82 41.47 23.45C41.82 24.07 42 24.78 42 25.5C42 26.22 41.82 26.92 41.47 27.55C41.12 28.17 40.62 28.69 40.01 29.05L16.02 43.44C15.41 43.8 14.72 44 14.01 44C13.31 44 12.62 43.81 12.01 43.45C11.4 43.09 10.89 42.57 10.54 41.95C10.19 41.32 10 40.61 10 39.89V11.11Z"
    />
  </svg>
);

export const PauseIcon = (props: IconProps) => (
  <svg viewBox="0 0 52 52" {...iconBase} {...props}>
    <rect fill="currentColor" x="11" y="8" width="10" height="36" rx="3" />
    <rect fill="currentColor" x="31" y="8" width="10" height="36" rx="3" />
  </svg>
);

export const BackIcon = (props: IconProps) => (
  <svg viewBox="0 0 45 45" {...iconBase} {...props}>
    <path
      fill="currentColor"
      d="M20.08 11.64C20.81 10.91 20.81 9.72 20.08 8.99C19.34 8.25 18.16 8.25 17.42 8.99L6.56 19.85C5.1 21.31 5.1 23.69 6.56 25.15L17.42 36.01C18.16 36.75 19.34 36.75 20.08 36.01C20.81 35.28 20.81 34.09 20.08 33.36L11.09 24.38H37.5C38.54 24.38 39.37 23.54 39.37 22.5C39.37 21.46 38.54 20.63 37.5 20.63H11.09L20.08 11.64Z"
    />
  </svg>
);

export const ChevronIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const CheckIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const PersonIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

export const MoreIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <circle fill="currentColor" cx="5" cy="12" r="2" />
    <circle fill="currentColor" cx="12" cy="12" r="2" />
    <circle fill="currentColor" cx="19" cy="12" r="2" />
  </svg>
);

export const PreviousIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <rect fill="currentColor" x="5" y="5" width="3" height="14" rx="1" />
    <path fill="currentColor" d="M19 5.9v12.2a1 1 0 0 1-1.5.86L9.3 12.86a1 1 0 0 1 0-1.72l8.2-6.1A1 1 0 0 1 19 5.9Z" />
  </svg>
);

export const NextIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <rect fill="currentColor" x="16" y="5" width="3" height="14" rx="1" />
    <path fill="currentColor" d="M5 5.9v12.2a1 1 0 0 0 1.5.86l8.2-6.1a1 1 0 0 0 0-1.72L6.5 5.04A1 1 0 0 0 5 5.9Z" />
  </svg>
);
