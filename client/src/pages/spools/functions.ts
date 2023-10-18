import { ISpool } from "./model";

export async function setSpoolArchived(spool: ISpool, archived: boolean) {
  const apiEndpoint = import.meta.env.VITE_APIURL;
  const init: RequestInit = {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      archived: archived,
    }),
  };
  const request = new Request(apiEndpoint + "/spool/" + spool.id);
  await fetch(request, init);
}
