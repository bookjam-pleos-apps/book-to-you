// 마이크 거리 안내 그림이다. 곰(마스코트 색) 옆모습의 입은 (160,128)이다.
// 색은 모두 디자인 토큰 클래스다(곰 brand, 귀 mascot-ear, 흰색 surface, 글자 ink, 문제 표시 danger).

const Bear = () => (
  <>
    <path className="fill-brand" d="M34 236 C34 196 60 172 100 172 C140 172 166 196 166 236 Z" />
    <circle cx="72" cy="56" r="17" className="fill-brand" />
    <circle cx="72" cy="56" r="8" className="fill-mascot-ear" />
    <circle cx="98" cy="104" r="52" className="fill-brand" />
    <rect x="116" y="98" width="48" height="38" rx="19" className="fill-surface" />
    <ellipse cx="159" cy="107" rx="7" ry="6" className="fill-ink" />
    <circle cx="122" cy="86" r="5" className="fill-ink" />
    <path d="M146 126 q6 4 12 0" className="stroke-ink" strokeWidth="3" strokeLinecap="round" fill="none" />
  </>
);

// 원점에 그리고 키프레임으로 통째로 옮긴다. 위쪽 끝(-y)이 마이크다.
const PhoneInHand = () => (
  <g className="mg-mobile">
    <rect x="-14" y="-28" width="28" height="56" rx="7" className="fill-surface" />
    <rect x="-10" y="-20" width="20" height="34" rx="3" className="fill-ink" opacity=".16" />
    <circle cx="0" cy="-24" r="2.6" className="fill-ink" />
    <path className="fill-surface stroke-ink" d="M-17 8 h34 a3 3 0 0 1 3 3 v14 a8 8 0 0 1 -8 8 h-24 a8 8 0 0 1 -8 -8 v-14 a3 3 0 0 1 3 -3 z" strokeOpacity=".3" strokeWidth="2" />
    <ellipse className="fill-surface stroke-ink" cx="-15" cy="2" rx="5.5" ry="10" transform="rotate(20 -15 2)" strokeOpacity=".3" strokeWidth="2" />
  </g>
);

const SoundArcs = () => (
  <g className="stroke-surface" strokeWidth="3.5" strokeLinecap="round" fill="none">
    <path className="mg-arc" d="M176.9 121.9 A18 18 0 0 1 169 143.7" />
    <path className="mg-arc mg-arc-2" d="M188.2 117.8 A30 30 0 0 1 175 154.1" />
    <path className="mg-arc mg-arc-3" d="M199.5 113.7 A42 42 0 0 1 181 164.5" />
  </g>
);

const HandSpan = () => (
  <g className="mg-span">
    <path d="M162 134 L206 171" className="stroke-surface" strokeWidth="2.5" strokeDasharray="3 6" strokeLinecap="round" />
    <text x="172" y="170" textAnchor="end" className="fill-surface" fontSize="13" fontWeight="700">
      한 뼘
    </text>
  </g>
);

// 입김 방울은 흰 주둥이와 겹치지 않게 주둥이 밖에서 시작한다.
const Breath = () => (
  <>
    <g className="mg-puffs fill-surface">
      <circle cx="179" cy="128" r="4.5" />
      <circle cx="172" cy="128" r="3.2" opacity=".8" />
      <circle cx="167" cy="128" r="2.2" opacity=".6" />
    </g>
    <path className="mg-burst stroke-danger" d="M184 116 l-3 -8 M184 140 l-3 8 M188 114 l3 -8 M188 142 l3 8" strokeWidth="3.5" strokeLinecap="round" />
  </>
);

const Verdicts = () => (
  <>
    <g className="mg-cross">
      <circle cx="242" cy="80" r="17" className="fill-danger" />
      <path d="M235.5 73.5 l13 13 M248.5 73.5 l-13 13" className="stroke-surface" strokeWidth="3.5" strokeLinecap="round" />
    </g>
    <g className="mg-check">
      <circle cx="264" cy="166" r="17" className="fill-surface" />
      <path d="M256.5 166.5 l5 5 l10 -10.5" className="stroke-ink" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  </>
);

export const MicGuideArt = () => (
  <svg viewBox="0 0 300 240" className="aspect-5/4 h-auto w-full max-w-75 overflow-visible" aria-hidden="true" focusable="false">
    <Bear />
    <SoundArcs />
    <HandSpan />
    <PhoneInHand />
    <Breath />
    <Verdicts />
  </svg>
);
