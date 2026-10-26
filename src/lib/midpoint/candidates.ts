import type { Candidate, LatLng } from "@/types/domain";

import { haversineKm } from "../geo";
import { searchNearbyAreas, searchNearbyStations } from "../kakao/local";

/** 후보 개수 상한. 참여자 수 × 후보 수 만큼 길찾기 API를 호출하므로 반드시 묶어둔다. */
export const MAX_CANDIDATES = 5;

const SEARCH_RADII_METERS = [3000, 5000, 8000];

/**
 * 중심점 주변에서 만날 만한 후보 지점을 찾는다.
 * 지하철역 우선 → 없으면 번화가 → 그것도 없으면 중심점 자체.
 */
export async function generateCandidates(center: LatLng): Promise<Candidate[]> {
  for (const radius of SEARCH_RADII_METERS) {
    const stations = await searchNearbyStations(center, radius);
    const unique = dedupeByName(stations);

    // 반경을 넓혀가며 후보 3곳을 확보한다. 첫 반경에서 충분하면 더 넓히지 않는다.
    if (unique.length >= 3) {
      return nearestTo(center, unique, MAX_CANDIDATES);
    }
  }

  // 역세권이 아닌 지역 폴백
  const areas = dedupeByName(await searchNearbyAreas(center));
  if (areas.length > 0) {
    return nearestTo(center, areas, MAX_CANDIDATES);
  }

  return [{ ...center, name: "중간 지점", source: "centroid" }];
}

/**
 * 같은 역이 호선별로 여러 건 잡히는 경우가 많아, 역 이름 기준으로 중복을 제거한다.
 * (예: "강남역 2호선", "강남역 신분당선")
 */
function dedupeByName(candidates: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>();

  for (const candidate of candidates) {
    const key = candidate.name.replace(/\s.*$/, "");
    if (!seen.has(key)) {
      seen.set(key, { ...candidate, name: key });
    }
  }

  return [...seen.values()];
}

function nearestTo(
  center: LatLng,
  candidates: Candidate[],
  limit: number,
): Candidate[] {
  return [...candidates]
    .sort((a, b) => haversineKm(center, a) - haversineKm(center, b))
    .slice(0, limit);
}
