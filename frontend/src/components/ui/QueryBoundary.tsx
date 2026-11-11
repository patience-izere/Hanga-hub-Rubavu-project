import type { ReactNode } from "react";

import { isNetworkError } from "../../api/client";
import { EmptyState } from "./EmptyState";

type QueryLike = {
  isPending: boolean;
  isError: boolean;
  isFetching?: boolean;
  /** "paused" when TanStack Query is waiting for the device to come back online. */
  fetchStatus?: "fetching" | "paused" | "idle";
  /** Failed attempts so far; above zero while it retries. */
  failureCount?: number;
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
  empty?: { title: string; description?: string; symbol?: string; action?: ReactNode };
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
  // Offline, the query waits for a connection instead of failing; without this the page said
  // "Loading…" for as long as the device stayed offline.
  if (query.isPending && query.fetchStatus === "paused") {
    return (
      <div className="panel-status query-error" role="alert">
        <p className="form-error">
          You&apos;re offline. This page needs a connection; it will load when you reconnect.
        </p>
        {query.refetch ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void query.refetch?.()}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (query.isPending) {
    return (
      <p className="panel-status" role="status">
        {(query.failureCount ?? 0) > 0
          ? "Still trying… the server did not answer the first time."
          : loading}
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
    return (
      <EmptyState
        title={empty.title}
        description={empty.description}
        symbol={empty.symbol}
        action={empty.action}
      />
    );
  }

  return <>{children(query.data)}</>;
}
