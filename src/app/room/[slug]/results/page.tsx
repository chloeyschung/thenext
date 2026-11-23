import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateCard } from "@/components/CandidateCard";
import { KakaoMap } from "@/components/KakaoMap";
import { getRoomBySlug, listParticipants } from "@/lib/db/queries";
import { protectedResults } from "@/lib/protections/results";

// API와 동일한 참여자 지문 캐시/방별 lease를 사용한다.
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

  const result = await protectedResults(room.id, participants);
  const { candidates } = result;
  if (result.status === "busy" || result.status === "unavailable") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">결과 안내</h1>
        <p role="status">{result.message}</p>
        <Link href={`/room/${slug}`}>모임 화면으로 돌아가기</Link>
      </main>
    );
  }
  const quotaLimited = candidates.some((candidate) => candidate.etas.some((eta) => eta.estimateReason === "quota"));
  const protectionUnavailable = candidates.some((candidate) => candidate.etas.some((eta) => eta.estimateReason === "protection-unavailable"));
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
          {participants.length}명의 출발지·귀가지와 각 방향의 이동수단을 반영해, 가장 오래 걸리는 사람의
          왕복 합계가 짧은 순서로 골랐어요. 동점이면 전원의 왕복 시간 합이 짧은 곳을 먼저 보여줘요.
        </p>
        <p className="text-xs text-neutral-500">출발지 → 모임 장소 → 귀가지의 경로 비교예요. 실제 출발시각·모임 종료시각·시간표·막차를 예측하지 않아요.</p>
      </header>

      {quotaLimited && <p role="status" className="text-sm text-amber-700">대중교통 호출량 보호 한도에 도달해 일부 시간은 직선거리 추정치예요. 실제 API 잔여량과는 다를 수 있어요.</p>}
      {protectionUnavailable && <p role="status" className="text-sm text-amber-700">호출량 보호 상태를 확인할 수 없어 대중교통 조회를 차단하고 추정치로 표시했어요.</p>}
      {result.status === "cached" && <p className="text-xs text-neutral-500">최근 10분 이내에 계산한 결과예요. 추정 표시는 캐시에서도 유지돼요.</p>}
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
