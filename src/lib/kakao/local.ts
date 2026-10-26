import "server-only";

import type { Candidate, LatLng, PlaceSuggestion } from "@/types/domain";

const LOCAL_BASE = "https://dapi.kakao.com/v2/local";

type KakaoPlaceDocument = {
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string; // 경도
  y: string; // 위도
};

type KakaoSearchResponse = {
  documents: KakaoPlaceDocument[];
};

function restKey(): string {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.");
  return key;
}

async function kakaoGet(path: string, params: Record<string, string>) {
  const url = new URL(`${LOCAL_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${restKey()}` },
    // 장소 데이터는 자주 바뀌지 않지만, 방마다 결과가 달라야 하므로 캐시하지 않는다.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `카카오 로컬 API 오류 (${response.status}): ${await response.text()}`,
    );
  }

  return (await response.json()) as KakaoSearchResponse;
}

function toSuggestion(doc: KakaoPlaceDocument): PlaceSuggestion {
  return {
    label: doc.place_name || doc.address_name,
    detail: doc.road_address_name || doc.address_name,
    lat: Number(doc.y),
    lng: Number(doc.x),
  };
}

/** 출발지 자동완성용 키워드 검색 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const { documents } = await kakaoGet("/search/keyword.json", {
    query,
    size: "10",
  });
  return documents.map(toSuggestion);
}

/**
 * 중심점 주변 지하철역 검색.
 * 만날 곳은 "지도 위의 좌표"가 아니라 이름으로 약속할 수 있는 장소여야 하므로 역을 후보로 쓴다.
 */
export async function searchNearbyStations(
  center: LatLng,
  radiusMeters: number,
): Promise<Candidate[]> {
  const { documents } = await kakaoGet("/search/category.json", {
    category_group_code: "SW8", // 지하철역
    x: String(center.lng),
    y: String(center.lat),
    radius: String(radiusMeters),
    sort: "distance",
    size: "15",
  });

  return documents.map((doc) => ({
    name: doc.place_name,
    lat: Number(doc.y),
    lng: Number(doc.x),
    source: "station" as const,
  }));
}

/** 역이 전혀 없을 때 쓰는 폴백 — 중심점 주변의 동네/지역명 */
export async function searchNearbyAreas(center: LatLng): Promise<Candidate[]> {
  const { documents } = await kakaoGet("/search/keyword.json", {
    query: "번화가",
    x: String(center.lng),
    y: String(center.lat),
    radius: "10000",
    sort: "distance",
    size: "5",
  });

  return documents.map((doc) => ({
    name: doc.place_name,
    lat: Number(doc.y),
    lng: Number(doc.x),
    source: "area" as const,
  }));
}
