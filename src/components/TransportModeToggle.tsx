"use client";

import type { TransportMode } from "@/types/domain";

const MODES: Array<{ value: TransportMode; label: string; icon: string }> = [
  { value: "transit", label: "대중교통", icon: "🚇" },
  { value: "car", label: "자동차", icon: "🚗" },
];

type Props = {
  value: TransportMode;
  onChange: (mode: TransportMode) => void;
};

export function TransportModeToggle({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MODES.map((mode) => {
        const isSelected = mode.value === value;
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            aria-pressed={isSelected}
            className={`rounded-lg border px-4 py-3 font-medium transition ${
              isSelected
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700"
            }`}
          >
            <span className="mr-1.5">{mode.icon}</span>
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
