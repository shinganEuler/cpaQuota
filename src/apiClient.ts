import * as http from 'http';
import * as https from 'https';
import { getManagementKey } from './config';
import { ApiCallRequest, ApiCallResult, AuthFilesResponse } from './types';
import { safeJsonParse } from './utils';

const REQUEST_TIMEOUT_MS = 30_000;

interface RawResponse {
  statusCode: number;
  bodyText: string;
  body: unknown | null;
}

export class CpaApiClient {
  constructor(private readonly baseUrl: string) {}

  async getAuthFiles(): Promise<AuthFilesResponse> {
    const response = await this.request('GET', '/auth-files');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`GET /auth-files failed: HTTP ${response.statusCode} ${response.bodyText}`);
    }
    return response.body && typeof response.body === 'object'
      ? (response.body as AuthFilesResponse)
      : {};
  }

  async apiCall(payload: ApiCallRequest): Promise<ApiCallResult> {
    const response = await this.request('POST', '/api-call', payload);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`POST /api-call failed: HTTP ${response.statusCode} ${response.bodyText}`);
    }

    const body = response.body && typeof response.body === 'object'
      ? (response.body as Record<string, unknown>)
      : {};
    const rawStatusCode = body.status_code ?? body.statusCode;
    const statusCode = Number(rawStatusCode ?? 0);
    const rawBody = body.body;
    const bodyText = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? '');

    return {
      statusCode,
      bodyText,
      body: typeof rawBody === 'string' ? safeJsonParse(rawBody) ?? rawBody : rawBody ?? null
    };
  }

  private request(method: string, path: string, body?: unknown): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, `${this.baseUrl}/`);
      const bodyText = body === undefined ? '' : JSON.stringify(body);
      const key = getManagementKey();
      const headers: Record<string, string | number> = {
        Accept: 'application/json'
      };

      if (bodyText) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyText);
      }
      if (key) {
        headers.Authorization = `Bearer ${key}`;
      }

      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(
        url,
        {
          method,
          headers,
          timeout: REQUEST_TIMEOUT_MS
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on('end', () => {
            const responseText = Buffer.concat(chunks).toString('utf8');
            resolve({
              statusCode: res.statusCode ?? 0,
              bodyText: responseText,
              body: safeJsonParse(responseText)
            });
          });
        }
      );

      req.on('timeout', () => req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`)));
      req.on('error', reject);
      if (bodyText) {
        req.write(bodyText);
      }
      req.end();
    });
  }
}
