export type User = {
  id: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  organization: string;
  isStaff: boolean;
  roles: Array<"platform_admin" | "admin" | "instructor" | "learner" | "content_author">;
};

type ApiErrorBody = {
  detail?: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  const csrfToken = cookie("csrftoken");
  if (csrfToken && init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) {
    headers.set("X-CSRFToken", decodeURIComponent(csrfToken));
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/api/v1/auth/")) {
      sessionStorage.setItem("opedu:session-expired", "true");
      window.dispatchEvent(new Event("opedu:session-expired"));
    }
    throw new ApiError(response.status, body.detail || "The request could not be completed.");
  }
  return body;
}

export async function ensureCsrf(): Promise<void> {
  await apiFetch<{ detail: string }>("/api/v1/auth/csrf/");
}

export async function currentUser(): Promise<User | null> {
  try {
    const response = await apiFetch<{ user: User }>("/api/v1/auth/me/");
    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
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
