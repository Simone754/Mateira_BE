export function parseLimit(value: string | null | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
}

const MAX_PAGE = 10_000;

export function parsePage(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_PAGE);
}

export function parseBoolean(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function parseList(value: string | null | undefined, lower: boolean): Set<string> {
  const set = new Set<string>();
  if (!value) return set;

  for (const raw of String(value).split(",")) {
    const item = raw.trim();
    if (!item) continue;
    set.add(lower ? item.toLowerCase() : item);
  }

  return set;
}

export function parseDuration(value: string | null | undefined, fallbackSec: number): number {
  if (!value) return fallbackSec;
  const match = String(value).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return fallbackSec;

  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

  return amount * (multipliers[unit] || 1);
}
