import "server-only";

import type { LatLng } from "@/types/domain";

const SEARCH_PATH_URL = "https://api.odsay.com/v1/api/searchPubTransPathT";

type OdsayResponse = {
  result?: {
    path?: Array<{ info: { totalTime: number } }>;
  };
  error?: { code: string; msg: string };
};

/**
 * 대중교통 소요시간 (분).
 * 카카오는 대중교통 길찾기를 제공하지 않아 ODsay 를 쓴다.
 * 경로가 없거나 API 한도를 넘기면 null 을 돌려주고 호출부에서 추정치로 폴백한다.
 */
export async function getTransitMinutes(
  origin: LatLng,
  destination: LatLng,
): Promise<number | null> {
  const key = process.env.ODSAY_API_KEY;
  if (!key) throw new Error("ODSAY_API_KEY 환경변수가 설정되지 않았습니다.");

  const url = new URL(SEARCH_PATH_URL);
  url.searchParams.set("apiKey", key);
  url.searchParams.set("SX", String(origin.lng));
  url.searchParams.set("SY", String(origin.lat));
  url.searchParams.set("EX", String(destination.lng));
  url.searchParams.set("EY", String(destination.lat));
  // 0: 지하철+버스 통합 경로
  url.searchParams.set("SearchPathType", "0");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const data = (await response.json()) as OdsayResponse;
  // ODsay 는 실패해도 HTTP 200 에 error 필드를 담아 보낸다.
  if (data.error) return null;

  const best = data.result?.path?.[0];
  return best ? best.info.totalTime : null;
}
