import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const EXPORT_DIR = "data/exports";
export const MEDIA_DIR = "data/media";

export function donePath(resource: string) {
  return `${EXPORT_DIR}/${resource}.done`;
}

export function isDone(resource: string): boolean {
  return existsSync(donePath(resource));
}

export function markDone(resource: string, count: number) {
  writeFileSync(donePath(resource), JSON.stringify({ count, finishedAt: new Date().toISOString() }, null, 2));
}

export function jsonlPath(resource: string) {
  return `${EXPORT_DIR}/${resource}.jsonl`;
}

/** Appends records as JSON Lines. Called per-page so a crash mid-run keeps already-written pages. */
export function appendJsonl(resource: string, records: unknown[]) {
  if (records.length === 0) return;
  const path = jsonlPath(resource);
  mkdirSync(dirname(path), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  appendFileSync(path, lines);
}

/** Fresh start for a resource (idempotent re-run from scratch, not resume-from-partial). */
export function resetResource(resource: string) {
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(jsonlPath(resource), "");
}
