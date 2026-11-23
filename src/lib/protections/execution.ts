import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export type Execution = {
  assertOwner: () => Promise<boolean>;
  quotaDenied: boolean;
  quotaUnavailable: boolean;
};
export const execution = new AsyncLocalStorage<Execution>();

export function markQuotaDenied(unavailable = false): void {
  const current = execution.getStore();
  if (current) {
    current.quotaDenied = !unavailable || current.quotaDenied;
    current.quotaUnavailable = unavailable || current.quotaUnavailable;
  }
}

export async function assertCalculationOwner(): Promise<void> {
  const current = execution.getStore();
  if (current && !(await current.assertOwner())) throw new Error("Calculation lease expired");
}

/** No global fetch mutation. Room leases are fenced before every bounded outbound call. */
export async function guardedFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  await assertCalculationOwner();
  return fetch(input, { ...init, redirect: "error", signal: init.signal ?? AbortSignal.timeout(8000) });
}
