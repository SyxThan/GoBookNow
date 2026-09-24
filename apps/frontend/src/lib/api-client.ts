const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type ErrorPayload = { message?: string | string[] };
type AccessTokenPayload = { accessToken: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response): Promise<ApiError> {
  let payload: ErrorPayload | undefined;
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    // Infrastructure failures may have an empty response body.
  }

  const message = Array.isArray(payload?.message)
    ? payload.message.join(". ")
    : payload?.message;
  return new ApiError(
    response.status,
    message ?? `Request failed with status ${response.status}`,
  );
}

async function refreshAccessToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as AccessTokenPayload).accessToken;
}

export async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw await readError(response);
  return ((await response.json()) as AccessTokenPayload).accessToken;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit,
  accessToken: string | null,
  onToken: (token: string | null) => void,
  allowRefresh = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && allowRefresh) {
    try {
      const refreshedToken = await refreshAccessToken();
      onToken(refreshedToken);
      return apiRequest<T>(path, init, refreshedToken, onToken, false);
    } catch {
      onToken(null);
      throw new ApiError(401, "Phiên đăng nhập đã hết hạn.");
    }
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
