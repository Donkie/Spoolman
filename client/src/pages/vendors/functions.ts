import { getAPIURL } from "../../utils/url";
import { IVendor } from "./model";

/**
 * Get a vendor given its external ID.
 */
export async function getVendorByExternalID(external_id: string): Promise<IVendor | null> {
  // Make a search using GET and query params
  const response = await fetch(`${getAPIURL()}/vendor?${new URLSearchParams({ external_id })}`);
  if (!response.ok) {
    return null;
  }

  const data: IVendor[] = await response.json();
  if (data.length === 0) {
    return null;
  }

  return data[0];
}

/**
 * Create a new internal filament given an external filament object.
 * Returns the created internal filament.
 */
export async function getOrCreateVendorFromExternal(vendor_external_id: string): Promise<IVendor> {
  const existingVendor = await getVendorByExternalID(vendor_external_id);
  if (existingVendor) {
    return existingVendor;
  }

  const body: Omit<IVendor, "id" | "registered" | "extra"> = {
    name: vendor_external_id,
    external_id: vendor_external_id,
  };

  const response = await fetch(getAPIURL() + "/vendor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
}
