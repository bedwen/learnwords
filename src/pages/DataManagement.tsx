import React, { useRef, useState, useEffect } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  Database,
  AlertTriangle,
  FileJson,
  CheckCircle2,
} from 'lucide-react';
import Papa from 'papaparse';
import {
  exportData,
  importData,
  importWordsCsv,
  exportWordsCsv as apiExportWordsCsv,
  ExportData,
  CsvImportResult,
} from '../api/data';
import { getFolders } from '../api/folders';
import { Folder } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';

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
  const [csvPreview, setCsvPreview] = useState<{ total: number; sample: any[] } | null>(null);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // CSV Export state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [ungroupedCount, setUngroupedCount] = useState(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  useEffect(() => {
    getFolders()
      .then((res) => {
        setFolders(res.folders);
        setUngroupedCount(res.ungroupedCount);
      })
      .catch(() => {});
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
      setSuccess('Database backup exported successfully.');
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
        setError('Invalid JSON backup file format.');
      }
    };
    reader.onerror = () => {
      setError('Failed to read backup file.');
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
      setSuccess('Data imported successfully. Reloading application...');
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
          sample: parsed.data.slice(0, 5),
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
        setError('CSV Import failed.');
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
    <div className="py-4 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Data Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import and export your vocabulary and download complete JSON backups
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="whitespace-pre-line">{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <div>{success}</div>
        </div>
      )}

      <Tabs defaultValue="csv" className="space-y-6">
        <TabsList className="grid w-full sm:w-80 grid-cols-2">
          <TabsTrigger value="csv" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span>CSV Data</span>
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-2">
            <Database className="h-4 w-4" />
            <span>Full Backup</span>
          </TabsTrigger>
        </TabsList>

        {/* CSV Tab */}
        <TabsContent value="csv" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Import CSV Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-semibold">Import Vocabulary</CardTitle>
                </div>
                <CardDescription>
                  Upload vocabulary in bulk from a CSV file
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Required columns: <strong className="text-foreground">word, meaning, level</strong>.
                  Optional: <em>part_of_speech, example_sentence, example_translation, notes</em>.
                </p>

                <input
                  type="file"
                  accept=".csv"
                  ref={csvFileInputRef}
                  className="hidden"
                  onChange={handleCsvSelect}
                />

                <Button
                  onClick={() => csvFileInputRef.current?.click()}
                  className="w-full gap-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Choose CSV File</span>
                </Button>

                {csvResult && !csvResult.success && csvResult.errors.length > 0 && (
                  <div className="mt-4 p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg text-xs space-y-1">
                    <p className="font-semibold text-destructive">Import Errors:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-destructive">
                      {csvResult.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Export CSV Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-semibold">Export Vocabulary</CardTitle>
                </div>
                <CardDescription>
                  Download vocabulary as a formatted CSV spreadsheet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Select whether to export all words, ungrouped words, or words belonging to a specific folder.
                </p>

                <div className="space-y-3">
                  <Select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    disabled={isExportingCsv}
                    options={[
                      { value: '', label: 'All Words' },
                      { value: 'ungrouped', label: `Ungrouped (${ungroupedCount} words)` },
                      ...folders.map((f) => ({
                        value: f.id,
                        label: `${f.name} (${f.wordCount} words)`,
                      })),
                    ]}
                  />

                  <Button
                    variant="secondary"
                    onClick={handleCsvExport}
                    disabled={isExportingCsv}
                    className="w-full gap-2"
                  >
                    <Download className="h-4 w-4" />
                    <span>{isExportingCsv ? 'Exporting...' : 'Export as CSV'}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Full Backup JSON Tab */}
        <TabsContent value="backup" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export JSON Backup */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileJson className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-semibold">Download Backup</CardTitle>
                </div>
                <CardDescription>
                  Create an offline snapshot of your complete vocabulary data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Includes all words, learning history, spaced-repetition parameters, and custom folders.
                </p>

                <Button
                  onClick={handleExport}
                  className="w-full gap-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Backup (JSON)</span>
                </Button>
              </CardContent>
            </Card>

            {/* Restore JSON Backup */}
            <Card className="border-destructive/30 bg-card">
              <CardHeader>
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  <CardTitle className="text-base font-semibold">Restore Backup</CardTitle>
                </div>
                <CardDescription>
                  Overwrite the local database from a previous JSON backup
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Warning: Restoring will overwrite existing words and review records.
                </p>

                <input
                  type="file"
                  accept=".json"
                  ref={jsonFileInputRef}
                  className="hidden"
                  onChange={handleJsonSelect}
                />

                <Button
                  variant="danger"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="w-full gap-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Select Backup File (JSON)</span>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* CSV Preview Confirmation Modal */}
      <Modal
        isOpen={Boolean(csvPreview)}
        onClose={() => {
          setCsvPreview(null);
          setCsvFile(null);
        }}
        title="Confirm Vocabulary Import"
        description={`Found ${csvPreview?.total || 0} words in the CSV file. Existing words will be skipped.`}
      >
        <div className="space-y-5">
          {csvPreview && (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-secondary/40">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Word</TableHead>
                    <TableHead className="text-xs font-semibold">Meaning</TableHead>
                    <TableHead className="text-xs font-semibold">Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvPreview.sample.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{row.word || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.meaning || '-'}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={row.level as any}>{row.level || '-'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {csvPreview.total > 5 && (
                <div className="p-2.5 text-center text-xs text-muted-foreground bg-muted/40 border-t border-border">
                  ...and {csvPreview.total - 5} more words
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setCsvPreview(null);
                setCsvFile(null);
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmCsvImport}
              disabled={isProcessing}
            >
              {isProcessing ? 'Importing...' : 'Confirm Import'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* JSON Restore Confirmation Modal */}
      <Modal
        isOpen={Boolean(importFileData)}
        onClose={() => setImportFileData(null)}
        title="Restore Backup Confirmation"
        description="This operation will replace your current vocabulary database with the uploaded backup file."
      >
        <div className="space-y-5">
          <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
            <p className="font-semibold">Irreversible Action</p>
            <p>All existing local words, folders, and review records will be replaced.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Type <strong className="text-foreground">REPLACE</strong> to confirm:
            </label>
            <Input
              value={confirmReplaceText}
              onChange={(e) => setConfirmReplaceText(e.target.value)}
              placeholder="REPLACE"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              variant="secondary"
              onClick={() => setImportFileData(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmJsonImport}
              disabled={isProcessing || confirmReplaceText !== 'REPLACE'}
            >
              {isProcessing ? 'Restoring...' : 'Confirm Restore'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
