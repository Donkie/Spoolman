import { LiveEvent } from "@refinedev/core";
import { useEffect, useState } from "react";
import { getAPIURL } from "../utils/url";
import liveProvider from "./liveProvider";

const liveProviderInstance = liveProvider(getAPIURL());

/**
 * Hook that subscribes to live updates for the items in the dataSource
 * @param dataSource Original dataSource
 * @returns dataSource that is updated with live data
 */
export function useLiveify<Data extends { id: number }>(
  resource: string,
  dataSource: Data[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformPayload: (payload: any) => Data
) {
  // New state that holds the dataSource with updated values from the live provider
  const [updatedDataSource, setUpdatedDataSource] = useState<Data[]>(dataSource);

  // If the original dataSource changes, update the updatedDataSource
  useEffect(() => {
    setUpdatedDataSource(dataSource);
  }, [dataSource]);

  // Subscribe to changes for all items in the dataSource
  useEffect(() => {
    const itemIds = dataSource.map((item) => item.id);

    const subscription = liveProviderInstance?.subscribe({
      channel: `${resource}-list`,
      params: {
        resource: resource,
        ids: itemIds,
        subscriptionType: "useList",
      },
      types: ["update"],
      callback: (event: LiveEvent) => {
        setUpdatedDataSource((prev) =>
          prev.map((item) => {
            return item.id === event.payload.data.id ? transformPayload(event.payload.data) : item;
          })
        );
      },
    });

    // Unsubscribe when the component unmounts
    return () => {
      if (subscription) {
        liveProviderInstance?.unsubscribe(subscription);
      }
    };
  }, [resource, dataSource, transformPayload]);

  return updatedDataSource;
}
