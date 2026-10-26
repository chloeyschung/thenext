import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateCard } from "@/components/CandidateCard";
import { KakaoMap } from "@/components/KakaoMap";
import { getRoomBySlug, listParticipants } from "@/lib/db/queries";
import { computeMidpoint } from "@/lib/midpoint/compute";

// 참여자가 계속 들어올 수 있으므로 결과는 열 때마다 새로 계산한다.
export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const room = await getRoomBySlug(slug);
  if (!room) notFound();

  const participants = await listParticipants(room.id);

  if (participants.length < 2) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">아직 결과를 볼 수 없어요</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          최소 2명이 출발지를 입력해야 중간지점을 찾을 수 있어요.
        </p>
        <Link
          href={`/room/${slug}`}
          className="rounded-lg border border-neutral-300 px-4 py-3 font-medium dark:border-neutral-700"
        >
          참여 링크 공유하러 가기
        </Link>
      </main>
    );
  }

  const candidates = await computeMidpoint(participants);
  const hasEstimates = candidates.some((candidate) =>
    candidate.etas.some((eta) => eta.estimated),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {room.name ? `${room.name} — 추천 장소` : "추천 장소"}
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {participants.length}명의 출발지와 이동수단을 반영해, 가장 오래 걸리는 사람의
          시간이 짧은 순서로 골랐어요.
        </p>
      </header>

      <KakaoMap participants={participants} candidates={candidates} />

      <div className="space-y-4">
        {candidates.map((candidate, index) => (
          <CandidateCard
            key={`${candidate.name}-${candidate.lat}`}
            rank={index + 1}
            candidate={candidate}
          />
        ))}
      </div>

      {hasEstimates && (
        <p className="text-xs text-neutral-500">
          * &quot;추정&quot; 표시는 길찾기 조회에 실패해 직선거리로 계산한 값이에요.
        </p>
      )}

      <Link
        href={`/room/${slug}`}
        className="text-center text-sm text-neutral-500 underline underline-offset-4"
      >
        모임 화면으로 돌아가기
      </Link>
    </main>
  );
}
