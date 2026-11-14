import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSaveFile, state } = vi.hoisted(() => ({
  mockSaveFile: vi.fn(),
  state: {
    isNative: true,
    isPluginAvailable: true,
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => state.isNative,
    isPluginAvailable: (name: string) => (name === 'LocalFileExport' ? state.isPluginAvailable : false),
  },
  registerPlugin: (name: string) => {
    if (name === 'LocalFileExport') {
      return {
        saveFile: (...args: any[]) => mockSaveFile(...args),
      };
    }
    return {};
  },
}));

import { downloadFile } from '../src/utils/fileDownload';

describe('fileDownload utility', () => {
  beforeEach(() => {
    state.isNative = true;
    state.isPluginAvailable = true;
    mockSaveFile.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Native platform (LocalFileExport plugin)', () => {
    const originalFileReader = globalThis.FileReader;

    afterEach(() => {
      globalThis.FileReader = originalFileReader;
    });

    it('routes to LocalFileExport.saveFile with string content and returns saved result', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
        uri: 'content://com.android.providers.downloads.documents/document/123',
      });

      const result = await downloadFile({
        content: '{"words":[]}',
        filename: 'backup.json',
        mimeType: 'application/json',
      });

      expect(mockSaveFile).toHaveBeenCalledTimes(1);
      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'backup.json',
        content: '{"words":[]}',
        mimeType: 'application/json',
      });
      expect(result).toEqual({
        saved: true,
        cancelled: false,
        uri: 'content://com.android.providers.downloads.documents/document/123',
      });
    });

    it('converts Blob content to string before calling LocalFileExport.saveFile', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
        uri: 'content://export/csv/1',
      });

      const blob = new Blob(['word,meaning\napple,fruit\n'], { type: 'text/csv' });
      const result = await downloadFile({
        content: blob,
        filename: 'words.csv',
        mimeType: 'text/csv',
      });

      expect(mockSaveFile).toHaveBeenCalledTimes(1);
      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'words.csv',
        content: 'word,meaning\napple,fruit\n',
        mimeType: 'text/csv',
      });
      expect(result).toEqual({
        saved: true,
        cancelled: false,
        uri: 'content://export/csv/1',
      });
    });

    it('normalizes parameterized MIME types before calling LocalFileExport.saveFile', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
        uri: 'content://export/csv/normalized',
      });

      const result = await downloadFile({
        content: 'word,meaning\napple,fruit\n',
        filename: 'words.csv',
        mimeType: 'text/csv;charset=utf-8;',
      });

      expect(mockSaveFile).toHaveBeenCalledTimes(1);
      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'words.csv',
        content: 'word,meaning\napple,fruit\n',
        mimeType: 'text/csv',
      });
      expect(result).toEqual({
        saved: true,
        cancelled: false,
        uri: 'content://export/csv/normalized',
      });
    });

    it('handles Blob without text() method via FileReader fallback', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
      });

      // Mock a Blob-like object without text() to exercise FileReader path
      const content = new Blob(['fallback test']);
      const blobLikeWithoutText = {
        size: content.size,
        type: content.type,
        slice: content.slice.bind(content),
      } as any;

      if (typeof globalThis.FileReader === 'undefined') {
        class MockFileReader {
          result: string | null = null;
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          readAsText() {
            this.result = 'fallback test';
            if (this.onload) this.onload();
          }
        }
        (globalThis as any).FileReader = MockFileReader;
      }

      const result = await downloadFile({
        content: blobLikeWithoutText,
        filename: 'fallback.txt',
        mimeType: 'text/plain',
      });

      expect(mockSaveFile).toHaveBeenCalledTimes(1);
      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'fallback.txt',
        content: 'fallback test',
        mimeType: 'text/plain',
      });
      expect(result).toEqual({
        saved: true,
        cancelled: false,
        uri: undefined,
      });
    });

    it('returns cancelled result cleanly when user cancels file picker dialog', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: false,
        cancelled: true,
      });

      const result = await downloadFile({
        content: 'some text',
        filename: 'test.txt',
        mimeType: 'text/plain',
      });

      expect(mockSaveFile).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        saved: false,
        cancelled: true,
        uri: undefined,
      });
    });

    it('propagates rejection when LocalFileExport.saveFile throws an error', async () => {
      mockSaveFile.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(
        downloadFile({
          content: 'some text',
          filename: 'test.txt',
          mimeType: 'text/plain',
        })
      ).rejects.toThrow('Permission denied');
    });

    it('safely handles empty or undefined result fields from LocalFileExport.saveFile', async () => {
      mockSaveFile.mockResolvedValueOnce({});

      const result = await downloadFile({
        content: 'data',
        filename: 'data.txt',
        mimeType: '',
      });

      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'data.txt',
        content: 'data',
        mimeType: 'application/octet-stream',
      });
      expect(result).toEqual({
        saved: false,
        cancelled: false,
        uri: undefined,
      });
    });

    it('normalizes blank or whitespace-only mimeType to application/octet-stream', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
      });

      await downloadFile({
        content: 'sample',
        filename: 'sample.bin',
        mimeType: '   ;  charset=utf-8',
      });

      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'sample.bin',
        content: 'sample',
        mimeType: 'application/octet-stream',
      });
    });

    it('passes multi-byte UTF-8 content and special characters intact to native plugin', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
        uri: 'content://export/utf8',
      });

      const utf8Content = '{"word":"üniversite — 🌟"}';
      const result = await downloadFile({
        content: utf8Content,
        filename: 'backup.json',
        mimeType: 'application/json',
      });

      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'backup.json',
        content: utf8Content,
        mimeType: 'application/json',
      });
      expect(result.saved).toBe(true);
      expect(result.uri).toBe('content://export/utf8');
    });

    it('normalizes invalid MIME types without slash or starting/ending with slash to application/octet-stream', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
      });

      await downloadFile({
        content: 'test content',
        filename: 'test.dat',
        mimeType: 'invalid_mime_no_slash',
      });

      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'test.dat',
        content: 'test content',
        mimeType: 'application/octet-stream',
      });

      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
      });

      await downloadFile({
        content: 'test content 2',
        filename: 'test2.dat',
        mimeType: '/slash_at_start',
      });

      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'test2.dat',
        content: 'test content 2',
        mimeType: 'application/octet-stream',
      });
    });

    it('handles multi-megabyte JSON payload without truncation or corruption', async () => {
      mockSaveFile.mockResolvedValueOnce({
        saved: true,
        cancelled: false,
        uri: 'content://export/large_backup',
      });

      // Construct a large string ~2MB
      const baseChunk = '{"id":"word-1","term":"ephemeral","def":"lasting for a very short time"},';
      const largeContent = '{"words":[' + baseChunk.repeat(25000) + '{"id":"word-end","term":"end","def":"finish"}]}';

      const result = await downloadFile({
        content: largeContent,
        filename: 'large_backup.json',
        mimeType: 'application/json',
      });

      expect(mockSaveFile).toHaveBeenCalledWith({
        filename: 'large_backup.json',
        content: largeContent,
        mimeType: 'application/json',
      });
      expect(result.saved).toBe(true);
      expect(result.uri).toBe('content://export/large_backup');
    });
  });

  describe('Web / Desktop browser fallback', () => {
    let originalDocument: any;
    let originalURL: any;
    let createdAnchor: any;
    let mockClick: any;
    let mockCreateObjectURL: any;
    let mockRevokeObjectURL: any;

    beforeEach(() => {
      state.isNative = false;
      mockClick = vi.fn();
      mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-uuid');
      mockRevokeObjectURL = vi.fn();

      originalDocument = globalThis.document;
      originalURL = globalThis.URL;

      createdAnchor = {
        href: '',
        download: '',
        click: mockClick,
        parentNode: null as any,
      };

      const mockBody = {
        appendChild: vi.fn((node: any) => {
          node.parentNode = mockBody;
          return node;
        }),
        removeChild: vi.fn((node: any) => {
          node.parentNode = null;
          return node;
        }),
      };

      const mockDoc = {
        body: mockBody,
        createElement: vi.fn((tag: string) => {
          if (tag === 'a') {
            return createdAnchor;
          }
          return {};
        }),
      };

      Object.defineProperty(globalThis, 'document', {
        value: mockDoc,
        writable: true,
        configurable: true,
      });

      const mockUrlClass = class MockURL {
        static createObjectURL = mockCreateObjectURL;
        static revokeObjectURL = mockRevokeObjectURL;
      };

      Object.defineProperty(globalThis, 'URL', {
        value: mockUrlClass,
        writable: true,
        configurable: true,
      });

      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'URL', {
        value: originalURL,
        writable: true,
        configurable: true,
      });
    });

    it('creates object URL and triggers anchor click with string content', async () => {
      const result = await downloadFile({
        content: '{"data":"test"}',
        filename: 'export.json',
        mimeType: 'application/json',
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(createdAnchor.href).toBe('blob:http://localhost/mock-blob-uuid');
      expect(createdAnchor.download).toBe('export.json');
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ saved: true, cancelled: false });

      // Check URL.revokeObjectURL called after 1000ms
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-blob-uuid');
    });

    it('creates object URL and triggers anchor click with Blob content', async () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const result = await downloadFile({
        content: blob,
        filename: 'hello.txt',
        mimeType: 'text/plain',
      });

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(createdAnchor.download).toBe('hello.txt');
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ saved: true, cancelled: false });
    });

    it('falls back to web download when native platform is true but plugin is unavailable', async () => {
      state.isNative = true;
      state.isPluginAvailable = false;

      const result = await downloadFile({
        content: 'fallback web',
        filename: 'file.txt',
        mimeType: 'text/plain',
      });

      expect(mockSaveFile).not.toHaveBeenCalled();
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ saved: true, cancelled: false });
    });
  });
});
