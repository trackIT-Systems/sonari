import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/app/api";

import type { User } from "@/types";
import type { AxiosError } from "axios";

export default function useActiveUser({
  user: initial,
  enabled = true,
}: {
  user?: User;
  enabled?: boolean;
} = {}) {
  const query = useQuery<User, AxiosError>({
    queryKey: ["me"],
    queryFn: api.auth.me,
    initialData: initial,
    staleTime: 30_000,
    gcTime: 60 * 60 * 1000, // when the gcTime expires, react will re-fetch the data. This might lead to the problem that set filters in annotation task are lost. Therefore, we set a hopefully large enough time.
    retry: false,
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
    refetchIntervalInBackground: false,
  });

  return {
    ...query,
  };
}
