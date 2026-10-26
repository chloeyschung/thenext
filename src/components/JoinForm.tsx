"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AddressSearchInput } from "@/components/AddressSearchInput";
import { TransportModeToggle } from "@/components/TransportModeToggle";
import type { PlaceSuggestion, TransportMode } from "@/types/domain";

type Props = {
  slug: string;
};

export function JoinForm({ slug }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [place, setPlace] = useState<PlaceSuggestion | null>(null);
  const [mode, setMode] = useState<TransportMode>("transit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && place !== null && !isSubmitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!place) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${slug}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          addressLabel: place.label,
          lat: place.lat,
          lng: place.lng,
          transportMode: mode,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "제출하지 못했어요.");
      }

      router.push(`/room/${slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "알 수 없는 오류");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <label className="block space-y-2">
        <span className="text-sm font-medium">이름</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 윤수"
          maxLength={50}
          className="w-full rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-300"
        />
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium">출발지</span>
        <AddressSearchInput value={place} onChange={setPlace} />
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">이동수단</span>
        <TransportModeToggle value={mode} onChange={setMode} />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isSubmitting ? "제출 중..." : "제출하기"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
