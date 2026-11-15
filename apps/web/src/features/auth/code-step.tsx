import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { failureCode } from "../../shared/api-client/api-error";
import { isLoadFailed } from "../../shared/api-client/load-state";
import { ProblemAlert } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { LoadFailed, TextLink } from "../../shared/ui/controls";
import { TextField } from "../../shared/ui/field";
import { Form } from "../../shared/ui/form";
import { Dock } from "../../shared/ui/screen";
import { Body, Title } from "../../shared/ui/text";
import type { Terms } from "../../shared/api-client/terms";
import { requestOtp, verifyOtp } from "./auth-api";
import { otpErrorText } from "./email-step";
import { useSignIn } from "./use-sign-in";

const CODE_ERRORS: Record<string, string> = {
  invalid_code: "코드가 맞지 않거나 만료됐어요. 메일의 최신 코드를 넣어 주세요.",
  too_many_attempts: "여러 번 틀렸어요. 코드를 새로 받아 주세요.",
  terms_outdated: "약관이 바뀌었어요. 화면을 새로고침해 주세요.",
};

const codeErrorText = (error: unknown): string => CODE_ERRORS[failureCode(error) ?? ""] ?? "잠시 뒤에 다시 해 주세요.";

const onlyDigits = (value: string): string => value.replaceAll(/\D/g, "").slice(0, 6);

type CodeStepProps = { readonly email: string; readonly onSignedIn: () => void };

const ResendLink = ({ email }: { readonly email: string }) => {
  const resend = useMutation({ mutationFn: () => requestOtp(email) });
  return (
    <>
      {resend.isError ? <ProblemAlert title="다시 보내지 못했어요" body={otpErrorText(resend.error)} /> : null}
      <TextLink onClick={() => resend.mutate()} disabled={resend.isPending}>
        {resend.isSuccess ? "새 코드를 보냈어요" : "코드 다시 받기"}
      </TextLink>
    </>
  );
};

export const CodeStep = ({ email, onSignedIn }: CodeStepProps) => {
  const [code, setCode] = useState("");
  const { signIn: verify, terms } = useSignIn((typed: string, current: Terms) => verifyOtp(email, typed, current), onSignedIn);
  return (
    <Form onSubmit={() => verify.mutate(code)}>
      <Title>코드를 넣어 주세요</Title>
      <Body>{email}로 보낸 6자리 로그인 코드예요. 10분 동안 쓸 수 있어요.</Body>
      <TextField code inputMode="numeric" autoComplete="one-time-code" value={code}
        onChange={(event) => setCode(onlyDigits(event.target.value))} aria-label="로그인 코드" />
      {verify.isError ? <ProblemAlert title="로그인하지 못했어요" body={codeErrorText(verify.error)} /> : null}
      {isLoadFailed(terms) ? <LoadFailed onRetry={() => void terms.refetch()} /> : null}
      <ResendLink email={email} />
      <Dock>
        <Button className="w-full" type="submit" disabled={terms.data === undefined || code.length < 6 || verify.isPending}>
          {verify.isPending ? "확인 중…" : "로그인"}
        </Button>
      </Dock>
    </Form>
  );
};
