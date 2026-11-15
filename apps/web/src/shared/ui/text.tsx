import type { ReactNode } from "react";

type TextProps = { readonly children: ReactNode };

export const Title = ({ children }: TextProps) => <h1 className="mt-2 text-title font-semibold">{children}</h1>;

// 제목 바로 아래 한 줄 안내다(대본의 읽는 방법 등). 녹음 품질을 가르는 지시라 흐리게 두지 않는다.
export const Lead = ({ children }: TextProps) => <p className="-mt-3 text-base/6 text-ink-2">{children}</p>;

export const Body = ({ children }: TextProps) => <p className="text-base/6 text-ink-2">{children}</p>;

export const Hint = ({ children }: TextProps) => <p className="text-center text-caption-sm text-ink-3">{children}</p>;

export const SectionTitle = ({ children }: TextProps) => <h2 className="mt-2 text-lg/6 font-bold">{children}</h2>;
