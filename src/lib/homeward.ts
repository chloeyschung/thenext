import type { Participant, TransportMode } from "../types/domain";

/** Nullable additive columns preserve old rows without a backfill. */
export function homewardPlan(participant: Pick<Participant, "addressLabel" | "lat" | "lng" | "transportMode" | "homeAddressLabel" | "homeLat" | "homeLng" | "returnTransportMode">) {
  const hasHome = participant.homeAddressLabel != null && participant.homeLat != null && participant.homeLng != null;
  return {
    homeAddressLabel: hasHome ? participant.homeAddressLabel! : participant.addressLabel,
    homeLat: hasHome ? participant.homeLat! : participant.lat,
    homeLng: hasHome ? participant.homeLng! : participant.lng,
    returnTransportMode: (participant.returnTransportMode ?? participant.transportMode) as TransportMode,
  };
}
