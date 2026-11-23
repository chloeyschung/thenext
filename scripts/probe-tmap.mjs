import { getTransitMinutes } from "../src/lib/tmap/transit.ts";

if (process.env.ALLOW_TMAP_PROBE !== "1") {
  console.error("Live call disabled. Set ALLOW_TMAP_PROBE=1 to spend one TMAP request.");
  process.exit(1);
}

const nativeFetch = globalThis.fetch;
let requests = 0;
let status = null;
globalThis.fetch = async (url, options) => {
  requests += 1;
  if (requests > 1 || url !== "https://apis.openapi.sk.com/transit/routes/sub") {
    throw new Error("Probe permits only one TMAP summary request");
  }
  const response = await nativeFetch(url, { ...options, redirect: "error" });
  status = response.status;
  return response;
};

try {
  const minutes = await getTransitMinutes(
    { lng: 127.0276, lat: 37.4979 },
    { lng: 126.9237, lat: 37.5563 },
  );
  // Never print keys, request headers, bodies or raw exceptions.
  console.log(JSON.stringify({ requests, status, minutes }));
  if (requests !== 1 || status !== 200 || minutes === null) process.exitCode = 1;
} finally {
  globalThis.fetch = nativeFetch;
}
