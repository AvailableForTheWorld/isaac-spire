const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message = `API ${status}`,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}
