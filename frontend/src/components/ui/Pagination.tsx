import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 50;

/** Page controls with the position spelled out: "1–50 of 10,002". */
export function Pagination({
  page,
  pageSize = PAGE_SIZE,
  total,
  onPage,
  label = "items",
}: {
  page: number;
  pageSize?: number;
  total: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label={`Pages of ${label}`}>
      <button
        type="button"
        className="button button-secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span aria-live="polite">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} {label}
      </span>
      <button
        type="button"
        className="button button-secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

/** One page of a list held in memory, returning to page 1 whenever the list itself changes. */
export function usePage<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [items]);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  const slice = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );
  return { page: current, setPage, slice, total: items.length };
}

/** A value that settles a moment after the person stops typing, for searching on the server. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
