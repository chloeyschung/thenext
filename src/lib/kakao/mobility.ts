import "server-only";

import type { LatLng } from "@/types/domain";

const DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";

type KakaoDirectionsResponse = {
  routes: Array<{
    result_code: number;
    result_msg: string;
    summary?: { duration: number; distance: number };
  }>;
};

/**
 * 자동차 소요시간 (분). 경로를 못 찾으면 null 을 돌려주고 호출부에서 추정치로 폴백한다.
 */
export async function getDrivingMinutes(
  origin: LatLng,
  destination: LatLng,
): Promise<number | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.");

  const url = new URL(DIRECTIONS_URL);
  url.searchParams.set("origin", `${origin.lng},${origin.lat}`);
  url.searchParams.set("destination", `${destination.lng},${destination.lat}`);
  url.searchParams.set("priority", "RECOMMEND");

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as KakaoDirectionsResponse;
  const route = data.routes?.[0];

  // result_code 0 이 아니면 경로 탐색 실패 (출발지=도착지, 길 없음 등)
  if (!route || route.result_code !== 0 || !route.summary) return null;

  return Math.round(route.summary.duration / 60);
}
