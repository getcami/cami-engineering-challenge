const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type RequestStatus = 'open' | 'in_progress' | 'resolved';

export type RequestListItem = {
  id: string;
  message: string;
  status: RequestStatus;
  category: string | null;
  confidence: number | null;
  noteCount: number;
  latestNotePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * The API answers validation problems with `{ message: string | string[] }` and a
 * 4xx status. Surface that text instead of a bare status code.
 */
async function failure(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    const detail = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    if (detail) {
      return new Error(`${fallback}: ${detail}`);
    }
  } catch {
    // Non-JSON error body; fall through to the status code.
  }
  return new Error(`${fallback} (${res.status})`);
}

export async function fetchRequests(): Promise<RequestListItem[]> {
  const res = await fetch(`${API_URL}/requests`);
  if (!res.ok) {
    throw await failure(res, 'Failed to load requests');
  }
  return res.json();
}

export type CreatedRequest = {
  id: string;
  message: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
};

export async function createRequest(message: string): Promise<CreatedRequest> {
  const res = await fetch(`${API_URL}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    throw await failure(res, 'Failed to create request');
  }
  return res.json();
}

/** The status endpoint returns the updated request entity, not a list row. */
export type UpdatedRequest = CreatedRequest & {
  category: string | null;
  confidence: number | null;
};

export async function updateRequestStatus(
  id: string,
  status: RequestStatus,
): Promise<UpdatedRequest> {
  const res = await fetch(`${API_URL}/requests/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw await failure(res, 'Failed to update status');
  }
  return res.json();
}

export async function classifyMessage(message: string, requestId?: string) {
  const res = await fetch(`${API_URL}/requests/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, requestId }),
  });
  if (!res.ok) {
    throw await failure(res, 'Failed to classify');
  }
  return res.json();
}

export async function fetchHistory(category?: string) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`${API_URL}/requests/history${qs}`);
  if (!res.ok) {
    throw await failure(res, 'Failed to load history');
  }
  return res.json();
}
