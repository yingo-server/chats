import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return ""
  const diff = Date.now() - ts
  if (diff < 0) return "just now"
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export function timeFull(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return ""
  return new Date(ts).toLocaleString()
}
