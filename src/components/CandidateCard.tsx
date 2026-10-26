import type { RankedCandidate } from "@/types/domain";

type Props = {
  rank: number;
  candidate: RankedCandidate;
};

export function CandidateCard({ rank, candidate }: Props) {
  const sortedEtas = [...candidate.etas].sort((a, b) => b.minutes - a.minutes);

  return (
    <section className="rounded-xl border border-neutral-300 p-5 dark:border-neutral-700">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900">
            {rank}
          </span>
          {candidate.name}
        </h3>
        <p className="shrink-0 text-sm text-neutral-500">
          최대 {candidate.maxMinutes}분
        </p>
      </header>

      <ul className="space-y-2">
        {sortedEtas.map((eta) => (
          <li
            key={eta.participantId}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="truncate">
              {eta.transportMode === "car" ? "🚗" : "🚇"} {eta.participantName}
            </span>
            <span className="shrink-0 tabular-nums text-neutral-600 dark:text-neutral-400">
              {eta.minutes}분{eta.estimated && " (추정)"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
