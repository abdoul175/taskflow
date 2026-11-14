/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function utcDay(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Whole days between today and the given YYYY-MM-DD date (negative = past). */
export function dayOffset(isoDate: string): number {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((utcDay(isoDate) - today) / 86_400_000);
}

export function isOverdue(isoDate: string | null): boolean {
  return Boolean(isoDate && dayOffset(isoDate) < 0);
}

export function formatDueDate(isoDate: string): {
  label: string;
  overdue: boolean;
} {
  const offset = dayOffset(isoDate);

  if (offset === 0) return { label: 'Today', overdue: false };
  if (offset === 1) return { label: 'Tomorrow', overdue: false };
  if (offset === -1) return { label: 'Yesterday', overdue: true };

  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);

  return {
    label: date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    overdue: offset < 0,
  };
}

export function formatHeaderDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
