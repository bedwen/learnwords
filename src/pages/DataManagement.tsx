import React, { useRef, useState, useEffect } from 'react';
import { exportData, importData, importWordsCsv, exportWordsCsv as apiExportWordsCsv, ExportData, CsvImportResult } from '../api/data';
import { getFolders } from '../api/folders';
import { Folder } from '../types';
import Papa from 'papaparse';

export function DataManagement() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // JSON Backup Restore state
  const [importFileData, setImportFileData] = useState<ExportData | null>(null);
  const [confirmReplaceText, setConfirmReplaceText] = useState('');
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  // CSV Import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ total: number, sample: any[] } | null>(null);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // CSV Export state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [ungroupedCount, setUngroupedCount] = useState(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  useEffect(() => {
    getFolders().then(res => {
      setFolders(res.folders);
      setUngroupedCount(res.ungroupedCount);
    }).catch(() => {});
  }, []);

  // --- Export JSON ---
  const handleExport = async () => {
    try {
      setError(null);
      setSuccess(null);
      const data = await exportData();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learnwords-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess('Data exported successfully.');
    } catch (err: any) {
      setError(err.message || 'An error occurred during export.');
    }
  };

  // --- Import JSON Backup ---
  const handleJsonSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as ExportData;
        setImportFileData(data);
        setConfirmReplaceText('');
      } catch (err) {
        setError('Invalid JSON file format.');
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    reader.readAsText(file);
    
    if (jsonFileInputRef.current) {
      jsonFileInputRef.current.value = '';
    }
  };

  const confirmJsonImport = async () => {
    if (!importFileData || confirmReplaceText !== 'REPLACE') return;
    
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      await importData(importFileData);
      setSuccess('Data imported successfully.');
      setImportFileData(null);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'An error occurred during import.');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Import CSV Words ---
  const handleCsvSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
        if (parsed.errors.length > 0) {
          setError(`CSV format error: ${parsed.errors[0].message}`);
          return;
        }
        setCsvPreview({
          total: parsed.data.length,
          sample: parsed.data.slice(0, 5)
        });
      } catch (err) {
        setError('Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
    
    if (csvFileInputRef.current) {
      csvFileInputRef.current.value = '';
    }
  };

  const confirmCsvImport = async () => {
    if (!csvFile) return;
    
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await importWordsCsv(csvFile);
      setCsvResult(result);
      if (result.success) {
        setSuccess(`Successfully imported ${result.imported} words. Skipped ${result.skipped} duplicates.`);
        setCsvFile(null);
        setCsvPreview(null);
      } else {
        setError('Import failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during CSV import.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCsvExport = async () => {
    try {
      setIsExportingCsv(true);
      setError(null);
      setSuccess(null);
      
      const { blob, filename } = await apiExportWordsCsv(selectedFolderId);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(`Successfully exported words to ${filename}.`);
    } catch (err: any) {
      setError(err.message || 'An error occurred during CSV export.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  return (
    <div className="py-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-light text-surface-900 mb-8">Data Management</h1>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-md whitespace-pre-line">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 rounded-md">
          {success}
        </div>
      )}

      {/* 1. Import Words (CSV) */}
      <div className="bg-card transition-colors duration-200 rounded-lg shadow-sm border border-surface-200 overflow-hidden mb-6">
        <div className="p-6 border-b border-surface-200">
          <h2 className="text-xl font-medium text-surface-900 mb-2">Import Words (CSV)</h2>
          <p className="text-surface-600 mb-4">
            Add new words from a CSV file. The file must contain headers: word, meaning, level (Optional: part_of_speech, example_sentence, example_translation, notes).
          </p>
          <input
            type="file"
            accept=".csv"
            ref={csvFileInputRef}
            className="hidden"
            onChange={handleCsvSelect}
          />
          <button
            onClick={() => csvFileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Select CSV File
          </button>

          {csvResult && !csvResult.success && csvResult.errors.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/60 rounded">
              <h3 className="font-medium text-red-800 dark:text-red-300 mb-2">Import Errors:</h3>
              <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-1">
                {csvResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 2. Export Words (CSV) */}
      <div className="bg-card transition-colors duration-200 rounded-lg shadow-sm border border-surface-200 overflow-hidden mb-6">
        <div className="p-6 border-b border-surface-200">
          <h2 className="text-xl font-medium text-surface-900 mb-2">Export Words (CSV)</h2>
          <p className="text-surface-600 mb-4">
            Download your words as a CSV file. You can export all words, ungrouped words, or words from a specific folder.
          </p>
          
          <div className="flex items-center space-x-4">
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="px-3 py-2 border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-card transition-colors duration-200"
              disabled={isExportingCsv}
            >
              <option value="">All Words</option>
              <option value="ungrouped">Ungrouped ({ungroupedCount} words)</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.name} ({f.wordCount} words)</option>
              ))}
            </select>
            
            <button
              onClick={handleCsvExport}
              disabled={isExportingCsv}
              className="px-4 py-2 bg-surface-900 text-card rounded hover:bg-surface-800 transition-colors disabled:opacity-50"
            >
              {isExportingCsv ? 'Exporting...' : 'Export as CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Export Personal Data (JSON) */}
      <div className="bg-card transition-colors duration-200 rounded-lg shadow-sm border border-surface-200 overflow-hidden mb-6">
        <div className="p-6">
          <h2 className="text-xl font-medium text-surface-900 mb-2">Export Backup</h2>
          <p className="text-surface-600 mb-4">
            Download a complete backup of all your personal data including review history and learning progress.
          </p>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-surface-900 text-card rounded hover:bg-surface-800 transition-colors"
          >
            Download Backup (JSON)
          </button>
        </div>
      </div>

      {/* 4. Restore Backup (JSON) */}
      <div className="bg-card transition-colors duration-200 rounded-lg shadow-sm border border-surface-200 overflow-hidden opacity-90">
        <div className="p-6">
          <h2 className="text-xl font-medium text-red-800 dark:text-red-400 mb-2 flex items-center">
            <span className="mr-2">⚠️</span> Restore Backup
          </h2>
          <p className="text-surface-600 mb-4 text-sm">
            Restore a previous backup. This will replace all your current data. Use with caution.
          </p>
          <input
            type="file"
            accept=".json"
            ref={jsonFileInputRef}
            className="hidden"
            onChange={handleJsonSelect}
          />
          <button
            onClick={() => jsonFileInputRef.current?.click()}
            className="px-4 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors text-sm"
          >
            Restore from Backup (JSON)
          </button>
        </div>
      </div>

      {/* CSV Preview Modal */}
      {csvPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card transition-colors duration-200 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-medium text-surface-900 mb-2">Confirm Word Import</h3>
            <p className="text-surface-600 mb-4">
              Found <strong>{csvPreview.total}</strong> words in the file. Existing words will be skipped.
            </p>
            
            <div className="mb-6 border rounded overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-50 text-surface-600 border-b">
                  <tr>
                    <th className="px-4 py-2">Word</th>
                    <th className="px-4 py-2">Meaning</th>
                    <th className="px-4 py-2">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.sample.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2">{row.word || '-'}</td>
                      <td className="px-4 py-2">{row.meaning || '-'}</td>
                      <td className="px-4 py-2">{row.level || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvPreview.total > 5 && (
                <div className="p-2 text-center text-surface-500 text-sm bg-surface-50">
                  ...and {csvPreview.total - 5} more words
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setCsvPreview(null); setCsvFile(null); }}
                disabled={isProcessing}
                className="px-4 py-2 text-surface-600 hover:text-surface-900 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmCsvImport}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {isProcessing ? 'Importing...' : 'Confirm Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Restore Modal */}
      {importFileData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card transition-colors duration-200 rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-medium text-red-600 mb-4 flex items-center">
              <span className="mr-2">⚠️</span> Danger Zone
            </h3>
            <p className="text-surface-600 mb-4">
              This will <strong>DELETE all current data</strong> and replace it with the backup. This cannot be undone.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-surface-700 mb-2">
                Type <span className="font-bold">REPLACE</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmReplaceText}
                onChange={(e) => setConfirmReplaceText(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors duration-200"
                placeholder="REPLACE"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setImportFileData(null)}
                disabled={isProcessing}
                className="px-4 py-2 text-surface-600 hover:text-surface-900 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmJsonImport}
                disabled={isProcessing || confirmReplaceText !== 'REPLACE'}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
              >
                {isProcessing ? 'Restoring...' : 'Restore Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
