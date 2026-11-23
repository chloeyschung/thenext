import "server-only";

import type { LatLng } from "@/types/domain";
import { assertCalculationOwner } from "./protections/execution";
import { getTransitMinutes as getOdsayMinutes } from "./odsay/transit";
import { getTransitMinutes as getTmapMinutes } from "./tmap/transit";

/** 공통 대중교통 ETA 계약: 분 단위, 조회 실패 시 null. */
export async function getTransitMinutes(
  origin: LatLng,
  destination: LatLng,
): Promise<number | null> {
  try {
    await assertCalculationOwner();
    return await (process.env.TRANSIT_PROVIDER === "odsay"
      ? getOdsayMinutes(origin, destination)
      : getTmapMinutes(origin, destination));
  } catch {
    // ODsay 원본은 유지하되 비밀 키가 포함될 수 있는 예외는 호출부로 전달하지 않는다.
    return null;
  }
}
