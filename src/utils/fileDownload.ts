import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DownloadFileOptions {
  content: string | Blob;
  filename: string;
  mimeType: string;
}

export interface DownloadFileResult {
  saved: boolean;
  cancelled: boolean;
  uri?: string;
}

interface LocalFileExportPlugin {
  saveFile(options: {
    filename: string;
    content: string;
    mimeType: string;
  }): Promise<{
    saved: boolean;
    cancelled: boolean;
    uri?: string;
  }>;
}

const LocalFileExport = registerPlugin<LocalFileExportPlugin>('LocalFileExport');

function normalizeMimeType(mimeType: string): string {
  const base = (mimeType || 'application/octet-stream').split(';')[0].trim();
  return base || 'application/octet-stream';
}

async function readContentAsString(content: string | Blob): Promise<string> {
  if (typeof content === 'string') {
    return content;
  }
  if (typeof (content as any).text === 'function') {
    return await (content as any).text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read content'));
    reader.readAsText(content);
  });
}

export async function downloadFile({
  content,
  filename,
  mimeType,
}: DownloadFileOptions): Promise<DownloadFileResult> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalFileExport')) {
    const textContent = await readContentAsString(content);
    const res = await LocalFileExport.saveFile({
      filename,
      content: textContent,
      mimeType: normalizeMimeType(mimeType),
    });
    return {
      saved: Boolean(res?.saved),
      cancelled: Boolean(res?.cancelled),
      uri: res?.uri,
    };
  }

  // Otherwise (Desktop / Web browser):
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  if (typeof document !== 'undefined' && document.body) {
    document.body.appendChild(a);
  }
  a.click();
  if (typeof document !== 'undefined' && document.body && a.parentNode === document.body) {
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true, cancelled: false };
}
