import { AuthFileItem, AuthFilesResponse } from './types';

export function normalizeAuthFilesResponse(body: unknown): AuthFilesResponse {
  if (Array.isArray(body)) {
    return { files: body as AuthFileItem[] };
  }
  if (!body || typeof body !== 'object') {
    return {};
  }

  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object'
    ? (record.data as Record<string, unknown>)
    : null;
  const candidates = [
    record.files,
    record.authFiles,
    record.auth_files,
    record.items,
    data?.files,
    data?.authFiles,
    data?.auth_files,
    data?.items,
    data
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return {
        ...(record as AuthFilesResponse),
        files: candidate as AuthFileItem[]
      };
    }
  }

  return record as AuthFilesResponse;
}
