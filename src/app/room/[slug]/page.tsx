import Link from "next/link";
import { notFound } from "next/navigation";

import { ShareLink } from "@/components/ShareLink";
import { getRoomBySlug, listParticipants } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const room = await getRoomBySlug(slug);
  if (!room) notFound();

  const participants = await listParticipants(room.id);
  const canSeeResults = participants.length >= 2;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {room.name ?? "모임 중간지점 찾기"}
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          아래 링크를 공유하고, 참여자들이 각자 출발지를 입력하면 결과를 볼 수 있어요.
        </p>
      </header>

      <ShareLink slug={slug} />

      <section className="space-y-3">
        <h2 className="font-semibold">
          참여자 <span className="text-neutral-500">{participants.length}명</span>
        </h2>

        {participants.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            아직 아무도 입력하지 않았어요.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-300 dark:divide-neutral-800 dark:border-neutral-700">
            {participants.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="font-medium">{participant.name}</span>
                <span className="truncate text-neutral-500">
                  {participant.transportMode === "car" ? "🚗" : "🚇"}{" "}
                  {participant.addressLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        <Link
          href={`/room/${slug}/join`}
          className="block w-full rounded-lg border border-neutral-900 px-4 py-3 text-center font-medium dark:border-neutral-100"
        >
          나도 출발지 입력하기
        </Link>

        {canSeeResults ? (
          <Link
            href={`/room/${slug}/results`}
            className="block w-full rounded-lg bg-neutral-900 px-4 py-3 text-center font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            결과 보기
          </Link>
        ) : (
          <p className="text-center text-sm text-neutral-500">
            2명 이상 입력하면 결과를 볼 수 있어요.
          </p>
        )}
      </div>
    </main>
  );
}
