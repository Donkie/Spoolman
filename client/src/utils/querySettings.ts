import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAPIURL } from "./url";

interface SettingResponseValue {
  value: string;
  is_set: boolean;
  type: string;
}

interface SettingsResponse {
  [key: string]: SettingResponseValue;
}

export function useGetSettings() {
  return useQuery<SettingsResponse>({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/setting/`);
      return response.json();
    },
  });
}

export function useGetSetting(key: string) {
  return useQuery<SettingResponseValue>({
    queryKey: ["settings", key],
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/setting/${key}`);
      return response.json();
    },
  });
}

export function useSetSetting<T>(key: string) {
  const queryClient = useQueryClient();

  return useMutation<SettingResponseValue, unknown, T, SettingResponseValue | undefined>({
    mutationFn: async (value) => {
      const response = await fetch(`${getAPIURL()}/setting/${key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(JSON.stringify(value)),
      });

      // Throw error if response is not ok
      if (!response.ok) {
        throw new Error((await response.json()).message);
      }

      return response.json();
    },
    onMutate: async (value) => {
      await queryClient.cancelQueries({
        queryKey: ["settings", key],
      });
      const previousValue = queryClient.getQueryData<SettingResponseValue>(["settings", key]);
      queryClient.setQueryData<SettingResponseValue>(["settings", key], (old) =>
        old ? { ...old, value: JSON.stringify(value) } : undefined,
      );
      return previousValue;
    },
    onError: (_error, _value, context) => {
      queryClient.setQueryData<SettingResponseValue>(["settings", key], context);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: ["settings", key],
      });
    },
  });
}
