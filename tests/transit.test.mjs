import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

const origin = { lng: 127.0276, lat: 37.4979 };
const destination = { lng: 126.9237, lat: 37.5563 };
const envKeys = ["TMAP_APP_KEY", "ODSAY_API_KEY", "TRANSIT_PROVIDER", "KAKAO_REST_API_KEY"];
let savedEnv;
const { protectionStore } = await import('../src/lib/protections/store.ts');

beforeEach((t) => {
  // Offline adapter tests reserve through a stub; DB atomicity is exercised separately.
  t.mock.method(protectionStore, 'reserve', async () => true);
  savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.TMAP_APP_KEY = "test-only-tmap-key";
  delete process.env.TRANSIT_PROVIDER;
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request in offline test");
  });
});

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test("HTTP errors, network failures and invalid JSON return null without logging secrets", async (t) => {
  const { getTransitMinutes } = await tmap();
  const log = t.mock.method(console, "error", () => {});
  const warn = t.mock.method(console, "warn", () => {});
  const failures = [
    async () => responseWithStatus(401),
    async () => responseWithStatus(429),
    async () => responseWithStatus(500),
    async () => { throw new Error(process.env.TMAP_APP_KEY); },
    async () => new Response("invalid json", { status: 200 }),
  ];
  for (const failure of failures) {
    t.mock.method(globalThis, "fetch", failure);
    assert.equal(await getTransitMinutes(origin, destination), null);
  }
  assert.equal(log.mock.callCount(), 0);
  assert.equal(warn.mock.callCount(), 0);
});

test('denied or unavailable quota never fetches; missing keys never reserve; all attempts count', async (t) => {
  const { getTransitMinutes } = await tmap();
  const fetched = t.mock.method(globalThis, 'fetch', async () => response(2400));
  let reservations = 0;
  t.mock.method(protectionStore, 'reserve', async () => { reservations++; return false; });
  assert.equal(await getTransitMinutes(origin, destination), null);
  assert.equal(fetched.mock.callCount(), 0);
  delete process.env.TMAP_APP_KEY;
  assert.equal(await getTransitMinutes(origin, destination), null);
  assert.equal(reservations, 1);
  process.env.TMAP_APP_KEY = 'test-only-key';
  t.mock.method(protectionStore, 'reserve', async () => { throw new Error('DB unavailable'); });
  assert.equal(await getTransitMinutes(origin, destination), null);
  assert.equal(fetched.mock.callCount(), 0);
  t.mock.method(protectionStore, 'reserve', async () => { reservations++; return true; });
  assert.equal(await getTransitMinutes(origin, destination), 40);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network'); });
  assert.equal(await getTransitMinutes(origin, destination), null);
  assert.equal(reservations, 3);
});

function responseWithStatus(status) {
  // A valid-looking body must not make an HTTP failure look successful.
  return new Response(JSON.stringify({ metaData: { plan: { itineraries: [{ totalTime: 2400 }] } } }), { status });
}

test("TMAP uses an eight-second deadline and aborted requests return null", async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 8000);
    return controller.signal;
  });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      queueMicrotask(() => controller.abort());
    });
  });
  const { getTransitMinutes } = await tmap();
  assert.equal(await getTransitMinutes(origin, destination), null);
  assert.equal(controller.signal.aborted, true);
});

test("provider facade defaults to TMAP when TRANSIT_PROVIDER is unset", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://apis.openapi.sk.com/transit/routes/sub");
    return response(2430);
  });
  const { getTransitMinutes } = await import("../src/lib/transit.ts");
  assert.equal(await getTransitMinutes(origin, destination), 41);
});

test("explicit odsay provider keeps the original ODsay request and minute units", async (t) => {
  process.env.TRANSIT_PROVIDER = "odsay";
  process.env.ODSAY_API_KEY = "test-only-odsay-key";
  const fetchMock = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.origin + url.pathname, "https://api.odsay.com/v1/api/searchPubTransPathT");
    assert.equal(url.searchParams.get("apiKey"), process.env.ODSAY_API_KEY);
    assert.equal(url.searchParams.get("SX"), String(origin.lng));
    assert.equal(url.searchParams.get("SY"), String(origin.lat));
    assert.equal(url.searchParams.get("EX"), String(destination.lng));
    assert.equal(url.searchParams.get("EY"), String(destination.lat));
    return Response.json({ result: { path: [{ info: { totalTime: 52 } }] } });
  });
  const { getTransitMinutes } = await import("../src/lib/transit.ts");
  assert.equal(await getTransitMinutes(origin, destination), 52);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("ODsay failures return null through the facade without logging or provider failover", async (t) => {
  process.env.TRANSIT_PROVIDER = "odsay";
  const { getTransitMinutes } = await import("../src/lib/transit.ts");
  delete process.env.ODSAY_API_KEY;
  assert.equal(await getTransitMinutes(origin, destination), null);
  process.env.ODSAY_API_KEY = "test-only-odsay-key";
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Request failed with a secret-bearing URL");
  });
  const log = t.mock.method(console, "error", () => {});
  assert.equal(await getTransitMinutes(origin, destination), null);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(log.mock.callCount(), 0);
});

test("midpoint pipeline uses TMAP by default while retaining Kakao driving ETAs", async (t) => {
  process.env.KAKAO_REST_API_KEY = "test-only-kakao-key";
  process.env.ODSAY_API_KEY = "test-only-odsay-key";
  let transitCalls = 0;
  let drivingCalls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const target = String(url);
    if (target.startsWith("https://dapi.kakao.com/")) return stationResponse();
    if (target === "https://apis.openapi.sk.com/transit/routes/sub") {
      transitCalls += 1;
      return response(2460);
    }
    if (target.startsWith("https://apis-navi.kakaomobility.com/")) {
      drivingCalls += 1;
      return Response.json({ routes: [{ result_code: 0, summary: { duration: 1800, distance: 10000 } }] });
    }
    // Old import produces a plausible but visibly different ODsay ETA.
    if (target.startsWith("https://api.odsay.com/")) {
      return Response.json({ result: { path: [{ info: { totalTime: 99 } }] } });
    }
    throw new Error("Unexpected URL");
  });
  const { computeMidpoint } = await import("../src/lib/midpoint/compute.ts");
  const ranked = await computeMidpoint(participants());
  assert.equal(ranked.length, 3);
  assert.equal(transitCalls, 3);
  assert.equal(drivingCalls, 3);
  for (const candidate of ranked) {
    assert.deepEqual(candidate.etas.map(({ minutes, estimated }) => ({ minutes, estimated })), [
      { minutes: 41, estimated: false }, { minutes: 30, estimated: false },
    ]);
    assert.equal(candidate.maxMinutes, 41);
    assert.equal(candidate.totalMinutes, 71);
  }
});

test("midpoint marks failed TMAP ETAs as estimated and retains finite minimax results", async (t) => {
  process.env.KAKAO_REST_API_KEY = "test-only-kakao-key";
  const { computeMidpoint } = await import("../src/lib/midpoint/compute.ts");
  for (const failure of ["missing-key", "http-429", "no-route", "invalid-duration", "network", "abort"]) {
    if (failure === "missing-key") delete process.env.TMAP_APP_KEY;
    else process.env.TMAP_APP_KEY = "test-only-tmap-key";
    let transitCalls = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
      if (String(url).startsWith("https://dapi.kakao.com/")) return stationResponse();
      assert.equal(url, "https://apis.openapi.sk.com/transit/routes/sub");
      transitCalls += 1;
      if (failure === "http-429") return responseWithStatus(429);
      if (failure === "no-route") return Response.json({ result: { status: 14 } });
      if (failure === "invalid-duration") return response(-100);
      if (failure === "abort") throw new DOMException("Aborted", "AbortError");
      throw new Error("Network error");
    });
    const ranked = await computeMidpoint(participants().map((p) => ({ ...p, transportMode: "transit" })));
    assert.equal(ranked.length, 3, failure);
    assert.equal(transitCalls, failure === "missing-key" ? 0 : 6, failure);
    for (const candidate of ranked) {
      assert.equal(Number.isFinite(candidate.maxMinutes), true);
      for (const eta of candidate.etas) {
        assert.equal(eta.estimated, true, failure);
        assert.equal(Number.isFinite(eta.minutes) && eta.minutes > 0, true, failure);
      }
    }
    assert.deepEqual(ranked.map((c) => c.maxMinutes), ranked.map((c) => c.maxMinutes).toSorted((a, b) => a - b));
  }
});

test("explicit tmap and empty provider use TMAP, never auto-failing over to ODsay", async (t) => {
  const { getTransitMinutes } = await import("../src/lib/transit.ts");
  for (const provider of ["tmap", ""]) {
    process.env.TRANSIT_PROVIDER = provider;
    const fetchMock = t.mock.method(globalThis, "fetch", async (url) => {
      assert.equal(url, "https://apis.openapi.sk.com/transit/routes/sub");
      return response(1200);
    });
    assert.equal(await getTransitMinutes(origin, destination), 20);
    delete process.env.TMAP_APP_KEY;
    assert.equal(await getTransitMinutes(origin, destination), null);
    assert.equal(fetchMock.mock.callCount(), 1);
    process.env.TMAP_APP_KEY = "test-only-tmap-key";
  }
});

function stationResponse() {
  return Response.json({ documents: [
    { place_name: "테스트A역", x: "127.01", y: "37.51" },
    { place_name: "테스트B역", x: "127.02", y: "37.52" },
    { place_name: "테스트C역", x: "127.03", y: "37.53" },
  ] });
}

function participants() {
  return [
    { ...origin, id: "transit-user", name: "대중교통", addressLabel: "강남", transportMode: "transit" },
    { ...destination, id: "car-user", name: "자동차", addressLabel: "홍대", transportMode: "car" },
  ];
}

const tmap = () => import("../src/lib/tmap/transit.ts");
const response = (totalTime) => Response.json({
  metaData: { plan: { itineraries: [{ totalTime }] } },
});

test("TMAP posts string lon/lat coordinates and converts seconds to rounded minutes", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls += 1;
    assert.equal(url, "https://apis.openapi.sk.com/transit/routes/sub");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.appKey, process.env.TMAP_APP_KEY);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.cache, "no-store");
    assert.deepEqual(JSON.parse(options.body), {
      startX: "127.0276", startY: "37.4979",
      endX: "126.9237", endY: "37.5563", format: "json", count: 1,
    });
    return response(2461);
  });
  const { getTransitMinutes } = await tmap();
  assert.equal(await getTransitMinutes(origin, destination), 41);
  assert.equal(calls, 1);
});

test("missing TMAP key returns null without any request", async (t) => {
  delete process.env.TMAP_APP_KEY;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => response(2400));
  const { getTransitMinutes } = await tmap();
  assert.equal(await getTransitMinutes(origin, destination), null);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("invalid durations and malformed or empty route payloads return null", async (t) => {
  const { getTransitMinutes } = await tmap();
  const payloads = [
    null, {}, { result: { status: 14, message: "No route" } },
    { metaData: { plan: { itineraries: [] } } },
    { metaData: { plan: { itineraries: {} } } },
    { metaData: { plan: { itineraries: { 0: { totalTime: 2400 } } } } },
    { metaData: { plan: { itineraries: [null] } } },
    ...[undefined, null, "2460", -1, 0, NaN, Infinity].map((totalTime) => ({
      metaData: { plan: { itineraries: [{ totalTime }] } },
    })),
  ];
  for (const payload of payloads) {
    t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => payload }));
    assert.equal(await getTransitMinutes(origin, destination), null);
  }
});
