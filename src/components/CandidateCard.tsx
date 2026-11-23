import type { LegEta, RankedCandidate } from "@/types/domain";

type Props = { rank: number; candidate: RankedCandidate };

function Leg({ label, leg }: { label: string; leg: LegEta }) {
  const reason = leg.estimateReason === "quota" ? "호출량 보호 한도"
    : leg.estimateReason === "protection-unavailable" ? "호출량 보호 확인 불가" : "길찾기 조회 실패";
  return <p className="text-sm text-neutral-600 dark:text-neutral-400">
    {label} · {leg.transportMode === "car" ? "자동차" : "대중교통"} {leg.minutes}분
    {leg.estimated && <span> (추정: {reason})</span>}
  </p>;
}

export function CandidateCard({ rank, candidate }: Props) {
  const sortedEtas = [...candidate.etas].sort((a, b) => b.minutes - a.minutes);
  return (
    <section className="rounded-xl border border-neutral-300 p-5 dark:border-neutral-700">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900">{rank}</span>
          {candidate.name}
        </h3>
        <p className="text-sm text-neutral-500">최대 왕복 {candidate.maxMinutes}분</p>
      </header>
      <ul className="space-y-4">
        {sortedEtas.map((eta) => (
          <li key={eta.participantId} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="break-all font-medium">{eta.participantName}</span>
              <span className="tabular-nums">합계 {eta.minutes}분{eta.estimated && " (추정 포함)"}</span>
            </div>
            <Leg label="갈 때" leg={eta.outbound} />
            <Leg label="돌아올 때" leg={eta.homeward} />
          </li>
        ))}
      </ul>
    </section>
  );
}
