import type { ReactNode } from "react";

import { isNetworkError } from "../../api/client";
import { EmptyState } from "./EmptyState";

type QueryLike = {
  isPending: boolean;
  isError: boolean;
  isFetching?: boolean;
  error?: unknown;
  refetch?: () => unknown;
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
      <div className="panel-status query-error" role="alert">
        <p className="form-error">
          {isNetworkError(query.error)
            ? "You're offline. This will load when your connection returns."
            : error}
        </p>
        {query.refetch ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch?.()}
          >
            {query.isFetching ? "Trying again…" : "Try again"}
          </button>
        ) : null}
      </div>
    );
  }

  if (empty && isEmpty(query.data)) {
    return <EmptyState title={empty.title} description={empty.description} symbol={empty.symbol} />;
  }

  return <>{children(query.data)}</>;
}
