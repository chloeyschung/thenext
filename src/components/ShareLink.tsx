"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

type Props = {
  slug: string;
};

/** origin 은 브라우저에만 있는 값이라, 하이드레이션 불일치 없이 읽으려면 외부 스토어로 다룬다. */
const subscribeToNothing = () => () => {};

export function ShareLink({ slug }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // 배포 도메인을 하드코딩하지 않기 위해 브라우저에서 현재 origin 을 읽는다.
  const url = useSyncExternalStore(
    subscribeToNothing,
    useCallback(() => `${window.location.origin}/room/${slug}/join`, [slug]),
    () => "",
  );

  // 참여자가 들어오는 동안 방장 화면이 저절로 갱신되도록 주기적으로 새로고침한다.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [router]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 사용자가 아래 주소를 직접 복사할 수 있다.
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
      <h2 className="text-sm font-medium">참여 링크</h2>
      <p className="break-all rounded bg-neutral-100 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        {url || "링크 생성 중..."}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!url}
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-neutral-700"
      >
        {copied ? "복사했어요!" : "링크 복사"}
      </button>
    </section>
  );
}
