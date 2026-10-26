import { notFound } from "next/navigation";

import { JoinForm } from "@/components/JoinForm";
import { getRoomBySlug } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const room = await getRoomBySlug(slug);
  if (!room) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {room.name ?? "모임 중간지점 찾기"}
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          출발지와 이동수단을 알려주세요. 모두의 위치를 모아 만날 곳을 찾아드려요.
        </p>
      </header>

      <JoinForm slug={slug} />
    </main>
  );
}
