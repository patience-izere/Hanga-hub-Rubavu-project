import type { ReactNode } from "react";

import { EmptyState } from "./EmptyState";

type QueryLike = {
  isPending: boolean;
  isError: boolean;
};

type QueryBoundaryProps<TData> = {
  query: QueryLike & { data: TData | undefined };
  children: (data: TData) => ReactNode;
  /** Shown while the query is pending. */
  loading?: string;
  /** Shown with `role="alert"` when the query fails. */
  error?: string;
  /** Rendered instead of `children` when the resolved data is an empty array. */
  empty?: { title: string; description?: string; symbol?: string };
};

function isEmpty(data: unknown): boolean {
  return Array.isArray(data) && data.length === 0;
}

/**
 * Renders the pending, error and empty states for a TanStack Query in one place.
 *
 * Every page previously hand-rolled these three branches, which is how states ended up
 * inconsistent — one query on a page would handle `isError` and its neighbour would not.
 */
export function QueryBoundary<TData>({
  query,
  children,
  loading = "Loading…",
  error = "This information could not be loaded.",
  empty,
}: QueryBoundaryProps<TData>) {
  if (query.isPending) {
    return (
      <p className="panel-status" role="status">
        {loading}
      </p>
    );
  }

  if (query.isError || query.data === undefined) {
    return (
      <p className="panel-status form-error" role="alert">
        {error}
      </p>
    );
  }

  if (empty && isEmpty(query.data)) {
    return <EmptyState title={empty.title} description={empty.description} symbol={empty.symbol} />;
  }

  return <>{children(query.data)}</>;
}
