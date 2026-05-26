import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityType } from "./queryFields";
import { getAPIURL } from "./url";

export interface PhotoFile {
  id: number;
  registered: string;
  filename: string;
  content_type: string;
  original_content_type?: string;
  size_bytes: number;
  original_size_bytes: number;
  width?: number;
  height?: number;
  sha256: string;
}

export function photoContentUrl(photo: PhotoFile | number): string {
  const id = typeof photo === "number" ? photo : photo.id;
  if (typeof photo === "number") {
    return `${getAPIURL()}/photo/${id}/content`;
  }
  const version = `${photo.sha256}-${photo.size_bytes}-${photo.registered}`;
  return `${getAPIURL()}/photo/${id}/content?v=${encodeURIComponent(version)}`;
}

export function usePhotos(entityType: EntityType, entityId: number | undefined, fieldKey: string) {
  return useQuery<PhotoFile[]>({
    queryKey: ["photos", entityType, entityId, fieldKey],
    enabled: entityId !== undefined && entityId !== null,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/photo/${entityType}/${entityId}/${fieldKey}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error((await response.json()).message);
      }
      return response.json();
    },
  });
}

export function useUploadPhoto(entityType: EntityType, entityId: number | undefined, fieldKey: string) {
  const queryClient = useQueryClient();
  return useMutation<PhotoFile, Error, File>({
    mutationFn: async (file: File) => {
      const url =
        entityId === undefined || entityId === null
          ? `${getAPIURL()}/photo/orphan/${entityType}/${fieldKey}`
          : `${getAPIURL()}/photo/${entityType}/${entityId}/${fieldKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name),
          "Cache-Control": "no-store",
        },
        body: file,
      });
      if (!response.ok) {
        throw new Error((await response.json()).message);
      }
      return response.json();
    },
    onSuccess: (photo) => {
      if (entityId === undefined || entityId === null) {
        return;
      }
      queryClient.setQueryData<PhotoFile[]>(["photos", entityType, entityId, fieldKey], (old) => [
        ...(old ?? []),
        photo,
      ]);
    },
  });
}

export function useDeletePhoto(entityType: EntityType, entityId: number | undefined, fieldKey: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (photoId: number) => {
      const response = await fetch(`${getAPIURL()}/photo/${photoId}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error((await response.json()).message);
      }
    },
    onSuccess: (_data, photoId) => {
      if (entityId === undefined || entityId === null) {
        return;
      }
      queryClient.setQueryData<PhotoFile[]>(["photos", entityType, entityId, fieldKey], (old) =>
        (old ?? []).filter((photo) => photo.id !== photoId),
      );
    },
  });
}
