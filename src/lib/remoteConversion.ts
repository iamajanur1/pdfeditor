/** Optional conversion server; the browser never uploads a file without an explicit user action. */
export type RemoteConversion = 'pdf' | 'docx' | 'xlsx' | 'pptx';

export interface ConversionStatus {
  enabled: boolean;
  max_upload_mb: number;
  features: Record<string, boolean>;
  privacy: string;
}

const base = (import.meta.env.VITE_CONVERSION_API_URL || '/api/conversion').replace(/\/$/, '');

export async function conversionStatus(): Promise<ConversionStatus | null> {
  try {
    const response = await fetch(`${base}/status`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) return null;
    const data: ConversionStatus = await response.json();
    if (!data?.enabled || typeof data.features !== 'object') return null;
    return data;
  } catch { return null; }
}

export async function convertRemotely(file: File, target: RemoteConversion, options: { ocr?: boolean } = {}): Promise<Blob> {
  if (file.size > 25 * 1024 * 1024) throw new Error('This server accepts files up to 25 MB.');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 125_000);
  try {
    const form = new FormData();
    form.set('file', file, file.name);
    let response: Response;
    try {
      response = await fetch(`${base}/convert?target=${encodeURIComponent(target)}${options.ocr ? '&ocr=true' : ''}`, {
        method: 'POST', body: form, signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Conversion timed out. Try a smaller document.');
      throw new Error('Conversion service is unavailable. Start the optional Python service or contact the site administrator.');
    }
    if (!response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      let message = `Conversion failed (HTTP ${response.status}).`;
      if (contentType.includes('application/json')) {
        const body = await response.json().catch(() => ({}));
        if (typeof body.detail === 'string') message = body.detail;
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('The converter returned an empty file.');
    return blob;
  } finally { window.clearTimeout(timer); }
}
