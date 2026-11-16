import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function safeHex(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#18324b';
}
