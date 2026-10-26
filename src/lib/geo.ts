import type { LatLng } from "@/types/domain";

const EARTH_RADIUS_KM = 6371;

/** 두 좌표 사이 직선거리 (km) */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * 좌표들의 산술 중심점. 한 도시권 내 모임을 전제하므로 측지 계산 없이 평균으로 충분하다.
 */
export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) {
    throw new Error("중심점을 계산할 좌표가 없습니다.");
  }

  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );

  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
