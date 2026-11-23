import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Participant, RankedCandidate } from "@/types/domain";
import { computeMidpoint } from "../midpoint/compute";
import { getTmapCap, protectionStore, type ProtectionStore } from "./store";
import { execution, type Execution } from "./execution";

export type ProtectedResults = {
  status: "ready" | "cached" | "busy" | "unavailable";
  candidates: RankedCandidate[];
  message?: string;
};

export async function protectedResults(
  room: string,
  participants: Participant[],
  options: { store?: ProtectionStore; compute?: typeof computeMidpoint } = {},
): Promise<ProtectedResults> {
  const store = options.store ?? protectionStore;
  const compute = options.compute ?? computeMidpoint;
  const fingerprint = calculationFingerprint(participants, process.env.TRANSIT_PROVIDER === "odsay" ? "odsay" : "tmap");
  const owner = randomUUID();
  try {
    const cached = await store.read(room, fingerprint);
    if (cached) return completed("cached", cached);
    if (!(await store.acquire(room, fingerprint, owner))) {
      const raced = await store.read(room, fingerprint);
      return raced ? completed("cached", raced) : busy();
    }
    const state: Execution = {
      assertOwner: () => store.isOwner(room, owner), quotaDenied: false, quotaUnavailable: false,
    };
    const computed = await execution.run(state, () => compute(participants));
    const candidates = computed.map((candidate) => ({ ...candidate, etas: candidate.etas.map((eta) => ({
      ...eta,
      ...(eta.estimated && eta.transportMode === "transit" && (state.quotaDenied || state.quotaUnavailable)
        ? { estimateReason: state.quotaDenied ? "quota" as const : "protection-unavailable" as const } : {}),
    })) }));
    if (!(await store.publish(room, fingerprint, owner, candidates))) return busy();
    return completed("ready", candidates);
  } catch {
    return { status: "unavailable", candidates: [], message: "호출량 보호 저장소 또는 계산을 사용할 수 없어요. 잠시 후 다시 시도해 주세요." };
  } finally {
    // An expired owner must never release the successor's lock.
    await store.release(room, owner).catch(() => {});
  }
}

function completed(status: "ready" | "cached", candidates: RankedCandidate[]): ProtectedResults {
  const etas = candidates.flatMap((candidate) => candidate.etas);
  const message = etas.some((eta) => eta.estimateReason === "quota")
    ? "대중교통 호출량 보호 한도에 도달해 일부 시간은 직선거리 추정치예요. 실제 API 잔여량과는 다를 수 있어요."
    : etas.some((eta) => eta.estimateReason === "protection-unavailable")
      ? "호출량 보호 상태를 확인할 수 없어 대중교통 조회를 차단하고 추정치로 표시했어요."
      : etas.some((eta) => eta.estimated) ? "일부 시간은 길찾기 조회 실패로 직선거리 추정치예요." : undefined;
  return { status, candidates, ...(message ? { message } : {}) };
}

function busy(): ProtectedResults {
  return { status: "busy", candidates: [], message: "이미 이 모임의 결과를 계산 중이에요. 잠시 후 다시 열어 주세요." };
}

export function calculationFingerprint(participants: Participant[], provider: string): string {
  const exact = participants.map((p) => [p.id, p.name, p.addressLabel, p.lat, p.lng, p.transportMode,
    p.homeAddressLabel ?? p.addressLabel, p.homeLat ?? p.lat, p.homeLng ?? p.lng, p.returnTransportMode ?? p.transportMode])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  // Keep default/ODsay identities stable; opt-in budgets cannot reuse old quota-denied estimates.
  const version = provider === "tmap" && getTmapCap() !== 8 ? `roundtrip-v3:tmap-cap-${getTmapCap()}` : "roundtrip-v3";
  return createHash("sha256").update(JSON.stringify([version, provider, exact])).digest("hex");
}
