import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface SettingResponseValue {
  value: string;
  is_set: boolean;
  type: string;
}

interface SettingsResponse {
  [key: string]: SettingResponseValue;
}

export function useGetSettings() {
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<SettingsResponse>({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await fetch(`${apiEndpoint}/setting`);
      return response.json();
    },
  });
}

export function useGetSetting(key: string) {
  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useQuery<SettingResponseValue>({
    queryKey: ["settings", key],
    queryFn: async () => {
      const response = await fetch(`${apiEndpoint}/setting/${key}`);
      return response.json();
    },
  });
}

export function useSetSetting() {
  const queryClient = useQueryClient();

  const apiEndpoint = import.meta.env.VITE_APIURL;
  return useMutation<SettingResponseValue, unknown, { key: string; value: unknown }>({
    mutationFn: async ({ key, value }) => {
      const response = await fetch(`${apiEndpoint}/setting/${key}`, {
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
