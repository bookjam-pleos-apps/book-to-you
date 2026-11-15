import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { ProblemAlert } from "../../shared/ui/alert";
import { Button } from "../../shared/ui/button";
import { logout } from "./auth-api";

export const LogoutButton = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/", { replace: true });
    },
  });
  return (
    <>
      {signOut.isError ? <ProblemAlert title="로그아웃하지 못했어요" body="잠시 뒤에 다시 해 주세요." /> : null}
      <Button variant="outline" className="w-full" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
        로그아웃
      </Button>
    </>
  );
};
