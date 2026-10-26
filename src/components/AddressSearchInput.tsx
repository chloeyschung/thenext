"use client";

import { useEffect, useRef, useState } from "react";

import type { PlaceSuggestion } from "@/types/domain";

type Props = {
  value: PlaceSuggestion | null;
  onChange: (place: PlaceSuggestion | null) => void;
};

export function AddressSearchInput({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    query: string;
    places: PlaceSuggestion[];
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();
  // 검색 결과는 그 결과를 만든 쿼리와 함께 들고 있다가, 입력이 달라지면 렌더 시점에 버린다.
  // (effect 안에서 동기적으로 상태를 비우면 불필요한 연쇄 렌더가 생긴다)
  const isStale = result === null || result.query !== trimmedQuery;
  const places = isStale ? [] : result.places;
  const hasSearched = !isStale;

  // 타이핑마다 호출하지 않도록 300ms 디바운스
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/places/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        setResult({ query: trimmed, places: response.ok ? data.places : [] });
        setIsOpen(true);
      } catch {
        // 입력이 바뀌어 취소된 요청은 무시한다.
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // 바깥을 클릭하면 목록을 닫는다.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="min-w-0">
          <p className="truncate font-medium">{value.label}</p>
          <p className="truncate text-sm text-neutral-500">{value.detail}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="shrink-0 text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          변경
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="출발지를 검색하세요 (예: 강남역, 판교 유스페이스)"
        className="w-full rounded-lg border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-300"
      />

      {isSearching && (
        <p className="mt-2 text-sm text-neutral-500">검색 중...</p>
      )}

      {isOpen && places.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-950">
          {places.map((place) => (
            <li key={`${place.label}-${place.lat}-${place.lng}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(place);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                <span className="block font-medium">{place.label}</span>
                <span className="block text-sm text-neutral-500">
                  {place.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasSearched && !isSearching && places.length === 0 && (
        <p className="mt-2 text-sm text-neutral-500">검색 결과가 없어요.</p>
      )}
    </div>
  );
}
