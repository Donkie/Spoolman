import { getAPIURL } from "../../utils/url";
import { ISpool } from "../spools/model";

export async function setSpoolLocation(spool_id: number, location: string | null): Promise<ISpool> {
  const response = await fetch(getAPIURL() + "/spool/" + spool_id, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      location: location,
    }),
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
}
