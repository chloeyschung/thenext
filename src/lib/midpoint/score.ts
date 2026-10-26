import type { Candidate, ParticipantEta, RankedCandidate } from "@/types/domain";

/**
 * 공정성 기준: 가장 오래 걸리는 사람의 시간을 최소화(minimax)하고, 동점이면 총합으로 가른다.
 *
 * 분산 최소화 대신 minimax 를 쓰는 이유 — 사용자가 체감하는 불공정은 "전원이 비슷하게 애매한 것"이
 * 아니라 "나 혼자 90분 걸리는 것"이다. 혼자 오래 가는 사람이 없게 만드는 쪽이 직관에 맞는다.
 */
export function rankCandidates(
  scored: Array<{ candidate: Candidate; etas: ParticipantEta[] }>,
  topN: number,
): RankedCandidate[] {
  return scored
    .map(({ candidate, etas }) => ({
      ...candidate,
      etas,
      maxMinutes: Math.max(...etas.map((eta) => eta.minutes)),
      totalMinutes: etas.reduce((sum, eta) => sum + eta.minutes, 0),
    }))
    .sort(
      (a, b) =>
        a.maxMinutes - b.maxMinutes || a.totalMinutes - b.totalMinutes,
    )
    .slice(0, topN);
}
