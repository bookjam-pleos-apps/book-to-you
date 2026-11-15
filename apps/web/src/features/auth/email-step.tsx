import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { failureCode } from "../../shared/api-client/api-error";
import { ProblemAlert } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { TextField } from "../../shared/ui/field";
import { Form } from "../../shared/ui/form";
import { Dock } from "../../shared/ui/screen";
import { Body, Title } from "../../shared/ui/text";
import { requestOtp } from "./auth-api";

const EMAIL_ERRORS: Record<string, string> = {
  too_many_requests: "요청이 많았어요. 잠시 뒤에 다시 받아 주세요.",
  invalid_request: "이메일 주소를 다시 확인해 주세요.",
};

export const otpErrorText = (error: unknown): string =>
  EMAIL_ERRORS[failureCode(error) ?? ""] ?? "코드를 보내지 못했어요. 잠시 뒤에 다시 해 주세요.";

export const EmailStep = ({ onSent }: { readonly onSent: (email: string) => void }) => {
  const [email, setEmail] = useState("");
  const send = useMutation({ mutationFn: requestOtp, onSuccess: () => onSent(email.trim()) });
  return (
    <Form onSubmit={() => send.mutate(email.trim())}>
      <Title>이메일을 알려 주세요</Title>
      <Body>로그인 코드 6자리를 보내 드려요.</Body>
      <TextField type="email" inputMode="email" autoComplete="email" required
        placeholder="name@example.com" aria-label="이메일" value={email} onChange={(event) => setEmail(event.target.value)} />
      {send.isError ? <ProblemAlert title="코드를 보내지 못했어요" body={otpErrorText(send.error)} /> : null}
      <Dock>
        <Button className="w-full" type="submit" disabled={send.isPending || email.trim() === ""}>
          {send.isPending ? "보내는 중…" : "코드 받기"}
        </Button>
      </Dock>
    </Form>
  );
};
