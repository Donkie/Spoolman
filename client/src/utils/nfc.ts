import { useMutation, useQuery } from "@tanstack/react-query";
import { getAPIURL } from "./url";

/**
 * TigerTag data decoded from an NFC tag.
 */
export interface TigerTagData {
  id_tigertag: number;
  id_product: number;
  id_material: number;
  id_diameter: number;
  id_brand: number;
  color_hex: string;
  weight: number;
  nozzle_temp: number;
  bed_temp: number;
  drying_temp: number;
  drying_duration: number;
  timestamp: number;
  user_message: string;
  diameter_mm: number;
}

/**
 * Qidi tag data decoded from a MIFARE Classic tag.
 */
export interface QidiTagData {
  material_code: number;
  color_code: number;
  manufacturer_code: number;
  material_name: string;
  material_type: string;
  color_name: string;
  color_hex: string;
}

export interface NfcStatusResponse {
  enabled: boolean;
  status: string;
}

export interface NfcReadResponse {
  success: boolean;
  tag_format?: string;
  tag_data?: TigerTagData;
  qidi_data?: QidiTagData;
  spool_id?: number;
  nfc_tag_uid?: string;
  raw_data_b64?: string;
  message: string;
}

export interface NfcWriteRequest {
  spool_id: number;
  tag_format?: string;
  user_message?: string;
}

export interface NfcWriteResponse {
  success: boolean;
  nfc_tag_uid?: string;
  message: string;
}

export interface NfcEncodeRequest {
  spool_id: number;
  user_message?: string;
}

export interface NfcEncodeResponse {
  success: boolean;
  binary_b64: string;
  message: string;
}

/**
 * React Query hook to get the NFC reader status.
 */
export function useNfcStatus() {
  return useQuery<NfcStatusResponse>({
    queryKey: ["nfc", "status"],
    staleTime: 30000,
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/nfc/status`);
      return response.json();
    },
  });
}

/**
 * React Query mutation hook to read an NFC tag via the server.
 */
export function useNfcRead() {
  return useMutation<NfcReadResponse>({
    mutationFn: async () => {
      const response = await fetch(`${getAPIURL()}/nfc/read`, {
        method: "POST",
      });
      return response.json();
    },
  });
}

/**
 * React Query mutation hook to write an NFC tag via the server.
 */
export function useNfcWrite() {
  return useMutation<NfcWriteResponse, Error, NfcWriteRequest>({
    mutationFn: async (request: NfcWriteRequest) => {
      const response = await fetch(`${getAPIURL()}/nfc/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return response.json();
    },
  });
}

/**
 * React Query mutation hook to encode a spool as TigerTag binary via the server.
 */
export function useNfcEncode() {
  return useMutation<NfcEncodeResponse, Error, NfcEncodeRequest>({
    mutationFn: async (request: NfcEncodeRequest) => {
      const response = await fetch(`${getAPIURL()}/nfc/encode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return response.json();
    },
  });
}

export interface NfcBindRequest {
  spool_id: number;
  raw_data_b64?: string;
  tag_type?: string;
  id_product?: number;
  timestamp?: number;
  nfc_tag_uid?: string;
}

export interface NfcBindResponse {
  success: boolean;
  nfc_tag_id?: string;
  tag_data?: TigerTagData;
  qidi_data?: QidiTagData;
  message: string;
}

/**
 * React Query mutation hook to bind an NFC tag to an existing spool.
 */
export function useNfcBind() {
  return useMutation<NfcBindResponse, Error, NfcBindRequest>({
    mutationFn: async (request: NfcBindRequest) => {
      const response = await fetch(`${getAPIURL()}/nfc/bind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return response.json();
    },
  });
}

export interface NfcCreateFromTagRequest {
  tag_type?: string;
  // TigerTag fields
  id_product?: number;
  id_material?: number;
  id_diameter?: number;
  id_brand?: number;
  color_hex?: string;
  weight?: number;
  nozzle_temp?: number;
  bed_temp?: number;
  drying_temp?: number;
  drying_duration?: number;
  diameter_mm?: number;
  // Qidi fields
  material_code?: number;
  color_code?: number;
  // Common
  nfc_tag_uid?: string;
}

export interface NfcCreateFromTagResponse {
  success: boolean;
  spool_id?: number;
  message: string;
}

/**
 * React Query mutation hook to create a spool from decoded TigerTag data.
 */
export function useNfcCreateFromTag() {
  return useMutation<NfcCreateFromTagResponse, Error, NfcCreateFromTagRequest>({
    mutationFn: async (request: NfcCreateFromTagRequest) => {
      const response = await fetch(`${getAPIURL()}/nfc/create-from-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return response.json();
    },
  });
}

/**
 * Check if the browser supports the Web NFC API.
 */
export function isWebNfcSupported(): boolean {
  return "NDEFReader" in window;
}

// Web NFC API type declarations
declare global {
  interface Window {
    NDEFReader?: NDEFReaderConstructor;
  }

  interface NDEFReaderConstructor {
    new (): NDEFReader;
  }

  interface NDEFReader {
    scan(options?: NDEFScanOptions): Promise<void>;
    write(message: NDEFMessageInit, options?: NDEFWriteOptions): Promise<void>;
    onreading: ((event: NDEFReadingEvent) => void) | null;
    onreadingerror: ((event: Event) => void) | null;
  }

  interface NDEFScanOptions {
    signal?: AbortSignal;
  }

  interface NDEFWriteOptions {
    signal?: AbortSignal;
    overwrite?: boolean;
  }

  interface NDEFMessageInit {
    records: NDEFRecordInit[];
  }

  interface NDEFRecordInit {
    recordType: string;
    mediaType?: string;
    id?: string;
    data?: BufferSource | string;
    encoding?: string;
    lang?: string;
  }

  interface NDEFReadingEvent extends Event {
    serialNumber: string;
    message: NDEFMessage;
  }

  interface NDEFMessage {
    records: NDEFRecord[];
  }

  interface NDEFRecord {
    recordType: string;
    mediaType?: string;
    id?: string;
    data?: DataView;
    encoding?: string;
    lang?: string;
    toRecords?(): NDEFRecord[];
  }
}
