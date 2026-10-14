export type User = {
  id: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  organization: string;
  isStaff: boolean;
  roles: Array<"platform_admin" | "admin" | "instructor" | "learner" | "content_author">;
  /** Language chosen at invitation time; used as the initial interface locale. */
  preferredLanguage?: string;
};

type ApiErrorBody = {
  detail?: string;
  code?: string;
  errors?: unknown;
};

/** Field name → messages, as returned by DRF validation or model `message_dict` errors. */
export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, message: string, code = "", fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function flattenMessages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenMessages);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenMessages);
  return [];
}

/** Reads field errors from either the API's `{errors: {...}}` envelope or a bare message dict. */
function fieldErrorsFrom(body: Record<string, unknown>): FieldErrors {
  const source =
    body.errors && typeof body.errors === "object"
      ? (body.errors as Record<string, unknown>)
      : body.detail === undefined
        ? body
        : {};
  const result: FieldErrors = {};
  for (const [field, value] of Object.entries(source)) {
    const messages = flattenMessages(value);
    if (messages.length) result[field] = messages;
  }
  return result;
}

/**
 * The most useful sentence to show a person for a failed request: specific field messages when
 * the server sent them, otherwise its detail, otherwise the caller's fallback.
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const messages = Object.values(error.fieldErrors).flat();
  if (messages.length) return messages.join(" ");
  return error.message || fallback;
}

function cookie(name: string): string | undefined {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const csrfToken = cookie("csrftoken");
  if (csrfToken && init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) {
    headers.set("X-CSRFToken", decodeURIComponent(csrfToken));
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    // fetch only rejects when the request never reached a server.
    throw new ApiError(0, NETWORK_MESSAGE, "network_error");
  }

  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    // DRF answers an expired session with 403 `not_authenticated`, not 401.
    const sessionEnded =
      response.status === 401 || (response.status === 403 && body.code === "not_authenticated");
    if (
      sessionEnded &&
      !path.startsWith("/api/v1/auth/") &&
      !path.startsWith("/api/v1/monitoring/")
    ) {
      sessionStorage.setItem("opedu:session-expired", "true");
      window.dispatchEvent(new Event("opedu:session-expired"));
    }
    throw new ApiError(
      response.status,
      body.detail || "The request could not be completed.",
      body.code ?? "",
      fieldErrorsFrom(body as Record<string, unknown>),
    );
  }
  return body;
}

const NETWORK_MESSAGE = "We could not reach OPedu. Check your connection and try again.";

/** True when a request failed because the device could not reach the server at all. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

// The last signed-in person, so the app can open offline on a device that has downloaded
// lessons. Removed on sign-out and whenever the server says the session has ended.
const CACHED_USER_KEY = "opedu:last-user";

function rememberUser(user: User) {
  try {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage can be unavailable (private mode); the app then needs a connection to start.
  }
}

export function forgetCachedUser() {
  try {
    localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // Nothing was stored.
  }
}

function cachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export async function ensureCsrf(): Promise<void> {
  await apiFetch<{ detail: string }>("/api/v1/auth/csrf/");
}

export async function currentUser(): Promise<User | null> {
  try {
    const response = await apiFetch<{ user: User }>("/api/v1/auth/me/");
    rememberUser(response.user);
    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      forgetCachedUser();
      return null;
    }
    if (isNetworkError(error)) {
      const offlineUser = cachedUser();
      if (offlineUser) return offlineUser;
    }
    throw error;
  }
}

export async function signIn(email: string, password: string): Promise<User> {
  await ensureCsrf();
  const response = await apiFetch<{ user: User }>("/api/v1/auth/login/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  rememberUser(response.user);
  return response.user;
}

export async function signOut(): Promise<void> {
  await ensureCsrf();
  await apiFetch<{ detail: string }>("/api/v1/auth/logout/", { method: "POST" });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await ensureCsrf();
  await apiFetch<{ detail: string }>("/api/v1/auth/password/change/", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function requestPasswordReset(email: string): Promise<string> {
  await ensureCsrf();
  const response = await apiFetch<{ detail: string }>("/api/v1/auth/password/reset/", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return response.detail;
}

export async function confirmPasswordReset(
  uid: string,
  token: string,
  newPassword: string,
): Promise<void> {
  await ensureCsrf();
  await apiFetch<{ detail: string }>(`/api/v1/auth/password/reset/${uid}/${token}/`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}
