import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { getAPIURL } from "./url";

export enum FieldType {
  text = "text",
  integer = "integer",
  integer_range = "integer_range",
  float = "float",
  float_range = "float_range",
  datetime = "datetime",
  boolean = "boolean",
  choice = "choice",
}

export enum EntityType {
  vendor = "vendor",
  filament = "filament",
  spool = "spool",
}

export interface FieldParameters {
  name: string;
  order: number;
  unit?: string;
  field_type: FieldType;
  default_value?: string | (number | null)[] | boolean | dayjs.Dayjs;
  choices?: string[];
  multi_choice?: boolean;
}

export interface Field extends FieldParameters {
  key: string;
  entity_type: EntityType;
}

export function useGetFields(entity_type: EntityType) {
  return useQuery<Field[]>({
    queryKey: ["fields", entity_type],
    queryFn: async () => {
      const response = await fetch(`${getAPIURL()}/field/${entity_type}`);
      return response.json();
    },
  });
}

export function useSetField(entity_type: EntityType) {
  const queryClient = useQueryClient();

  return useMutation<Field[], unknown, { key: string; params: FieldParameters }, { previousFields?: Field[] }>({
    mutationFn: async ({ key, params }) => {
      const response = await fetch(`${getAPIURL()}/field/${entity_type}/${key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      // Throw error if response is not ok
      if (!response.ok) {
        throw new Error((await response.json()).message);
      }

      return response.json();
    },
    onMutate: async ({ key, params }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries(["fields", entity_type]);

      // Snapshot the previous value
      const previousFields = queryClient.getQueryData<Field[]>(["fields", entity_type]);

      // Optimistically update to the new value
      queryClient.setQueryData<Field[]>(["fields", entity_type], (old) => {
        if (!old) {
          return [
            {
              key: key,
              entity_type: entity_type,
              ...params,
            },
          ];
        }
        return old.map((field) => {
          if (field.key === key) {
            return { ...field, ...params };
          }
          return field;
        });
      });

      // Return a context object with the snapshotted value
      return { previousFields };
    },
    onError: (_err, _newFields, context) => {
      // Rollback to the previous value
      if (context?.previousFields) {
        queryClient.setQueryData(["fields", entity_type], context.previousFields);
      }
    },
    onSettled: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries(["fields", entity_type]);
    },
  });
}

export function useDeleteField(entity_type: EntityType) {
  const queryClient = useQueryClient();

  return useMutation<Field[], unknown, string>({
    mutationFn: async (key) => {
      const response = await fetch(`${getAPIURL()}/field/${entity_type}/${key}`, {
        method: "DELETE",
      });

      // Throw error if response is not ok
      if (!response.ok) {
        throw new Error((await response.json()).message);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries(["fields", entity_type]);
    },
  });
}
