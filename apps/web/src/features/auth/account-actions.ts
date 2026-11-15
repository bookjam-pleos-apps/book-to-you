import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { deleteAccount } from "./auth-api";

type Leaving = { readonly navigate: (path: string, options: { readonly replace: true }) => void; readonly clear: () => void };

// 먼저 시작 화면으로 옮긴 뒤 캐시를 지운다. 순서가 바뀌면 RequireSession이 로그인 화면으로 튕긴다.
export const afterAccountDeleted = ({ navigate, clear }: Leaving): void => {
  navigate("/", { replace: true });
  clear();
};

export const useDeleteAccount = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => afterAccountDeleted({ navigate: (path, options) => void navigate(path, options), clear: () => queryClient.clear() }),
  });
};
