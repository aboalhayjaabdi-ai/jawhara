import { readFileSync } from "node:fs";

export function readJsonl<T = any>(resource: string): T[] {
  return readFileSync(`data/exports/${resource}.jsonl`, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function idTail(gid: string | undefined | null): string | null {
  return gid ? gid.split("/").pop()! : null;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
