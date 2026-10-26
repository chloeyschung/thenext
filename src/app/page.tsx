"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "모임을 만들지 못했어요.");
      }

      const { slug } = await response.json();
      router.push(`/room/${slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "알 수 없는 오류");
      setIsCreating(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">어디서 만날까?</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          모두의 출발지와 이동수단을 모아서, 가장 공평한 만남 장소를 찾아드려요.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">모임 이름 (선택)</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 금요일 저녁 모임"
            maxLength={100}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-300"
          />
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isCreating ? "만드는 중..." : "모임 만들기"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}
