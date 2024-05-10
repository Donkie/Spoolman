import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useSetSetting() {
  const queryClient = useQueryClient();

  return useMutation<SettingResponseValue, unknown, { key: string; value: unknown }>({
    mutationFn: async ({ key, value }) => {
      const response = await fetch(`${getAPIURL()}/setting/${key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(value),
      });

      // Throw error if response is not ok
      if (!response.ok) {
        throw new Error((await response.json()).message);
      }

      return response.json();
    },
    onSuccess: (_data, { key }) => {
      // Invalidate and refetch
      queryClient.invalidateQueries(["settings", key]);
    },
  });
}
