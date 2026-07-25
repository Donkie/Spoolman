import { useQuery } from "@tanstack/react-query";
import { getAPIURL } from "./url";

export interface OrcaProfileField {
  key: string;
  name: string;
  field_type: string;
  unit?: string;
}

export function useOrcaProfileFields() {
  return useQuery<OrcaProfileField[]>({
    queryKey: ["orca", "profile-fields"],
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/orca/profile-fields`);
      return response.json();
    },
    staleTime: Infinity, // static list, never refetch
  });
}

export interface OrcaFilamentProfileSummary {
  // Cloud sync row UUID — identity for the picker's Select, NOT the orca_filament_id value.
  orca_id: string;
  filament_id?: string | null;
  setting_id?: string | null;
  name: string;
  vendor?: string | null;
  material?: string | null;
  color_hex?: string | null;
  // Full raw OrcaSlicer profile content, keyed by OrcaSlicer field name (e.g. "flow_ratio"),
  // for matching against whatever extra fields the user has defined. Values are typically
  // single-element arrays (OrcaSlicer's per-layer-override format), same as /orca/import uses.
  content: Record<string, unknown>;
}

/**
 * Whether Spoolman has a persisted OrcaCloud sign-in (from a prior Settings -> OrcaCloud
 * "Sign in with Google" flow) that useOrcaFilamentProfiles can reuse.
 */
export function useOrcaConnectionStatus() {
  return useQuery<{ connected: boolean }>({
    queryKey: ["orca", "auth-status"],
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/orca/auth/status`);
      return response.json();
    },
  });
}

/**
 * Synced OrcaCloud filament profiles, for a picker UI. Only fetches while `enabled` is true,
 * since opening the picker is what should trigger the (potentially slow, paginated) cloud fetch.
 */
export function useOrcaFilamentProfiles(enabled: boolean) {
  return useQuery<OrcaFilamentProfileSummary[]>({
    queryKey: ["orca", "profiles"],
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/orca/profiles`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to fetch OrcaCloud profiles");
      }
      return response.json();
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
