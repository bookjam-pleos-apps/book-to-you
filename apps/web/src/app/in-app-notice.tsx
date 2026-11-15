import { useState } from "react";

import { externalOpenUrl, isInAppBrowser, needsOutsideBrowser } from "../lib/browser/in-app-browser";
import { cn } from "../shared/lib/utils";
import { Button, buttonVariants } from "../shared/ui/button";
import { Dock, Screen } from "../shared/ui/screen";
import { Notice } from "../shared/ui/surfaces";
import { Body, Title } from "../shared/ui/text";

type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "주소 복사하기",
  copied: "주소를 복사했어요",
  failed: "위 주소를 길게 눌러 복사해 주세요",
};

// 인앱 웹뷰는 clipboard API가 없거나 거부하기도 한다. 실패하면 주소를 직접 복사하도록 안내한다.
const copyAddress = async (address: string): Promise<CopyState> => {
  try {
    await navigator.clipboard.writeText(address);
    return "copied";
  } catch {
    return "failed";
  }
};

// 카카오톡처럼 바깥 브라우저로 넘겨주는 앱이면 그 버튼을 먼저, 주소 복사는 둘째로 둔다.
const OpenButtons = ({ address }: { readonly address: string }) => {
  const [copy, setCopy] = useState<CopyState>("idle");
  const external = externalOpenUrl(navigator.userAgent, address);
  return (
    <Dock>
      {external === null ? null : (
        <a className={cn(buttonVariants(), "w-full")} href={external}>
          다른 브라우저로 열기
        </a>
      )}
      <Button variant={external === null ? "brand" : "outline"} className="w-full" onClick={() => void copyAddress(address).then(setCopy)}>
        {COPY_LABEL[copy]}
      </Button>
    </Dock>
  );
};

export const InAppNotice = () => {
  const address = window.location.href;
  return (
    <Screen>
      <Title>Safari나 Chrome에서 열어 주세요</Title>
      <Body>이 앱 안의 브라우저에서는 로그인과 녹음을 할 수 없어요.</Body>
      <Notice className="break-all select-all">{address}</Notice>
      <OpenButtons address={address} />
    </Screen>
  );
};

// 책장(보고 듣기)은 인앱 브라우저에서도 그대로 연다. 나머지는 바깥 브라우저로 안내한다.
export const shouldShowInAppNotice = (pathname: string): boolean => isInAppBrowser(navigator.userAgent) && needsOutsideBrowser(pathname);
