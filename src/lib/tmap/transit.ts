import "server-only";
import { guardedFetch } from "../protections/execution";

import type { LatLng } from "@/types/domain";
import { protectionStore } from "../protections/store";
import { markQuotaDenied } from "../protections/execution";

const SUMMARY_URL = "https://apis.openapi.sk.com/transit/routes/sub";

type TmapResponse = {
  metaData?: { plan?: { itineraries?: Array<{ totalTime?: number }> } };
};

/** TMAP 요약 경로의 소요시간(초)을 기존 ETA 계약인 정수 분으로 변환한다. */
export async function getTransitMinutes(
  origin: LatLng,
  destination: LatLng,
): Promise<number | null> {
  const key = process.env.TMAP_APP_KEY;
  if (!key) return null;

  try {
    try {
      if (!(await protectionStore.reserve())) {
        markQuotaDenied();
        return null;
      }
    } catch {
      markQuotaDenied(true);
      return null;
    }
    const response = await guardedFetch(SUMMARY_URL, {
      method: "POST",
      headers: {
        appKey: key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        startX: String(origin.lng),
        startY: String(origin.lat),
        endX: String(destination.lng),
        endY: String(destination.lat),
        format: "json",
        count: 1,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as TmapResponse;
    const itineraries = data?.metaData?.plan?.itineraries;
    if (!Array.isArray(itineraries)) return null;
    const seconds = itineraries[0]?.totalTime;
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds / 60)
      : null;
  } catch {
    // 키·응답·원본 예외를 기록하지 않고 호출부의 거리 기반 추정치를 사용한다.
    return null;
  }
}
