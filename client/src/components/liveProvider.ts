import { BaseKey, LiveEvent, LiveProvider } from "@refinedev/core";
import { getBasePath } from "../utils/url";

/**
 * A spoolman websocket event.
 */
interface Event {
  type: "updated" | "deleted" | "added";
  resource: "filament" | "spool" | "vendor";
  date: string;
  payload: {
    id: number;
    [key: string]: unknown;
  };
}

/**
 * Converts an API URL to a WebSocket URL.
 * E.g. "https://example.com/api/v1/..." -> "wss://example.com/api/v1/..."
 * or "/api/v1/..." -> "ws://example.com/api/v1/..."
 * @param apiUrl The API URL to convert
 * @returns The WebSocket URL
 */
function toWebsocketURL(apiUrl: string) {
  if (apiUrl[0] === "/") {
    // Relative URL, e.g. "/api/v1/..."

    // Get the current browser URL
    const currentURL = window.location.href;

    // Split the URL to separate the protocol, host, and path
    const urlParts = currentURL.split("/");
    const protocol = urlParts[0];
    const host = urlParts[2];

    if (protocol === "https:") {
      return `wss://${host}${apiUrl}`;
    } else {
      return `ws://${host}${apiUrl}`;
    }
  } else {
    // Absolute URL, e.g. "https://example.com/api/v1/..."

    // Replace the protocol with "ws://"
    return apiUrl.replace(/^http/, "ws");
  }
}

/**
 * Subscribes to a single resource.
 * @param apiUrl The API URL
 * @param channel The channel name, not really used
 * @param resource The resource name
 * @param callback The callback to call when the resource is updated
 * @param id Specific ID to subscribe to, if any. If not specified, subscribes to all IDs.
 * @returns A function to unsubscribe from the resource
 */
function subscribeSingle(
  apiUrl: string,
  channel: string,
  resource: string,
  callback: (event: LiveEvent) => void,
  id?: BaseKey
) {
  // Verify that WebSockets are supported
  if (!("WebSocket" in window)) {
    console.warn("WebSockets are not supported in this browser. Live updates will not be available.");
    return () => {};
  }

  const websocketURL = id ? toWebsocketURL(`${apiUrl}/${resource}/${id}`) : toWebsocketURL(`${apiUrl}/${resource}`);

  const ws = new WebSocket(websocketURL);
  ws.onmessage = (message) => {
    const data: Event = JSON.parse(message.data);
    const type = data.type === "added" ? "created" : data.type;
    const date = new Date(data.date);

    const liveEvent: LiveEvent = {
      channel: channel,
      type: type,
      payload: {
        data: data.payload,
        ids: [data.payload.id],
      },
      date: date,
    };

    callback(liveEvent);
  };

  return () => {
    ws.close();
  };
}

const liveProvider = (apiUrl: string): LiveProvider => ({
  subscribe: ({ channel, params, callback }) => {
    const { resource, subscriptionType, id, ids } = params ?? {};

    if (!subscriptionType) {
      throw new Error("[useSubscription]: `subscriptionType` is required in `params`");
    }

    if (!resource) {
      throw new Error("[useSubscription]: `resource` is required in `params`");
    }

    let idList: BaseKey[];
    if (ids) idList = ids;
    else if (id) idList = [id];
    else {
      // No ID specified, subscribe to all IDs
      return [subscribeSingle(apiUrl, channel, resource, callback)];
    }

    return idList.map((id) => {
      return subscribeSingle(apiUrl, channel, resource, callback, id);
    });
  },
  unsubscribe: (closers: (() => void)[]) => {
    closers.forEach((fn) => fn());
  },
});

export default liveProvider;
