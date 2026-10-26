import "server-only";

import type {
  Candidate,
  LatLng,
  Participant,
  ParticipantEta,
  RankedCandidate,
} from "@/types/domain";

import { centroid, haversineKm } from "../geo";
import { getDrivingMinutes } from "../kakao/mobility";
import { getTransitMinutes } from "../odsay/transit";
import { generateCandidates } from "./candidates";
import { rankCandidates } from "./score";

export const TOP_N = 3;

/** 길찾기 API 호출 동시성. 레이턴시와 rate limit 사이의 타협점. */
const CONCURRENCY = 5;

/** 추정치 폴백용 평균 속도 (km/h). 도심 기준 대략치. */
const AVG_SPEED_KMH = { transit: 25, car: 35 } as const;
/** 도보·환승·주차 등 이동수단 자체와 무관하게 붙는 고정 오버헤드 (분) */
const FIXED_OVERHEAD_MIN = { transit: 10, car: 5 } as const;

/**
 * 참여자 전원의 위치로부터 만날 만한 지점 상위 N곳을 계산한다.
 *
 * 1) 중심점 주변에서 후보 지점을 뽑고
 * 2) 참여자 × 후보 마다 실제 소요시간을 구한 뒤
 * 3) 가장 공평한 순서로 정렬한다.
 */
export async function computeMidpoint(
  participants: Participant[],
): Promise<RankedCandidate[]> {
  const center = centroid(participants);
  const candidates = await generateCandidates(center);

  // 참여자 N × 후보 M 개의 길찾기 호출. 후보 수를 묶어뒀으므로 최대 수십 회 수준이다.
  const tasks = candidates.flatMap((candidate) =>
    participants.map((participant) => async () => ({
      candidate,
      eta: await estimateEta(participant, candidate),
    })),
  );

  const results = await runWithConcurrency(tasks, CONCURRENCY);

  const grouped = candidates.map((candidate) => ({
    candidate,
    etas: results
      .filter((result) => result.candidate === candidate)
      .map((result) => result.eta),
  }));

  return rankCandidates(grouped, TOP_N);
}

async function estimateEta(
  participant: Participant,
  destination: Candidate,
): Promise<ParticipantEta> {
  const origin: LatLng = { lat: participant.lat, lng: participant.lng };

  let minutes: number | null = null;
  try {
    minutes =
      participant.transportMode === "car"
        ? await getDrivingMinutes(origin, destination)
        : await getTransitMinutes(origin, destination);
  } catch (error) {
    // 키 누락·한도 초과·일시 장애 어느 쪽이든 결과 화면 자체는 뜨는 편이 낫다.
    console.error("길찾기 호출 실패, 추정치로 대체합니다:", error);
  }

  if (minutes !== null) {
    return {
      participantId: participant.id,
      participantName: participant.name,
      transportMode: participant.transportMode,
      minutes,
      estimated: false,
    };
  }

  return {
    participantId: participant.id,
    participantName: participant.name,
    transportMode: participant.transportMode,
    minutes: fallbackMinutes(origin, destination, participant.transportMode),
    estimated: true,
  };
}

/** 직선거리 기반 대략치. 정확하진 않지만 후보 간 상대 비교는 가능하다. */
function fallbackMinutes(
  origin: LatLng,
  destination: LatLng,
  mode: Participant["transportMode"],
): number {
  const km = haversineKm(origin, destination);
  return Math.round(
    (km / AVG_SPEED_KMH[mode]) * 60 + FIXED_OVERHEAD_MIN[mode],
  );
}

/** Promise.all 을 한꺼번에 던지면 rate limit 에 걸리므로 동시 실행 수를 제한한다. */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  });

  await Promise.all(workers);
  return results;
}
