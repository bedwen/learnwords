package com.bedwen.learnwords;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalFileExport")
public class LocalFileExportPlugin extends Plugin {

    private static final long STALE_FILE_THRESHOLD_MS = 3600000L; // 1 hour
    private static final int BUFFER_SIZE = 8192;

    private static final ExecutorService IO_EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "LocalFileExport-IO");
        thread.setDaemon(true);
        return thread;
    });

    @PluginMethod
    public void saveFile(PluginCall call) {
        String filename = call.getString("filename");
        String content = call.getString("content");
        String rawMimeType = call.getString("mimeType", "application/octet-stream");
        String cleanMimeType = "application/octet-stream";
        if (rawMimeType != null && !rawMimeType.trim().isEmpty()) {
            String baseMime = rawMimeType.split(";")[0].trim();
            if (!baseMime.isEmpty()) {
                cleanMimeType = baseMime;
            }
        }

        if (filename == null || filename.trim().isEmpty() || content == null) {
            call.reject("Missing filename or content");
            return;
        }

        String safeFilename = filename.replaceAll("[/\\\\\\u0000]", "_").trim();
        if (safeFilename.isEmpty()) {
            safeFilename = "export.txt";
        }

        cleanUpStaleTempFiles();

        File tempFile = getPendingTempFile(call);
        if (tempFile == null) {
            call.reject("Invalid plugin call state: missing callback ID");
            return;
        }

        try (FileOutputStream fos = new FileOutputStream(tempFile)) {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
            fos.flush();
        } catch (IOException e) {
            call.reject("Failed to create temporary export file: " + e.getMessage(), e);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(cleanMimeType);
        intent.putExtra(Intent.EXTRA_TITLE, safeFilename);

        startActivityForResult(call, intent, "handleCreateDocumentResult");
    }

    @ActivityCallback
    private void handleCreateDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        final File tempFile = getPendingTempFile(call);

        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
            JSObject ret = new JSObject();
            ret.put("saved", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            if (bridge != null) {
                call.release(bridge);
            }
            return;
        }

        if (tempFile == null || !tempFile.exists()) {
            call.reject("Export temporary file not found");
            if (bridge != null) {
                call.release(bridge);
            }
            return;
        }

        final Uri uri = result.getData().getData();
        IO_EXECUTOR.execute(() -> {
            try (InputStream in = new FileInputStream(tempFile);
                 OutputStream out = openTruncatedOutputStream(uri)) {
                if (out == null) {
                    deletePartialDocument(uri);
                    call.reject("Failed to open destination output stream");
                    return;
                }

                byte[] buffer = new byte[BUFFER_SIZE];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
                out.flush();

                JSObject ret = new JSObject();
                ret.put("saved", true);
                ret.put("cancelled", false);
                ret.put("uri", uri.toString());
                call.resolve(ret);
            } catch (IOException | SecurityException e) {
                deletePartialDocument(uri);
                call.reject("Failed to save exported file: " + e.getMessage(), e);
            } finally {
                if (tempFile != null && tempFile.exists()) {
                    tempFile.delete();
                }
                if (bridge != null) {
                    call.release(bridge);
                }
            }
        });
    }

    private OutputStream openTruncatedOutputStream(Uri uri) throws FileNotFoundException {
        try {
            return getContext().getContentResolver().openOutputStream(uri, "wt");
        } catch (FileNotFoundException | IllegalArgumentException e) {
            return getContext().getContentResolver().openOutputStream(uri);
        }
    }

    private void deletePartialDocument(Uri uri) {
        if (uri == null) {
            return;
        }
        try {
            DocumentsContract.deleteDocument(getContext().getContentResolver(), uri);
        } catch (Exception ignored) {
            // Document deletion on failure is best-effort
        }
    }

    private File getPendingTempFile(PluginCall call) {
        if (call == null) {
            return null;
        }
        String callbackId = call.getCallbackId();
        if (callbackId == null || callbackId.isEmpty()) {
            return null;
        }
        String safeCallbackId = callbackId.replaceAll("[^a-zA-Z0-9_-]", "_");
        File cacheDir = getContext().getCacheDir();
        return new File(cacheDir, "pending_export_" + safeCallbackId + ".tmp");
    }

    private void cleanUpStaleTempFiles() {
        try {
            File cacheDir = getContext().getCacheDir();
            if (cacheDir != null && cacheDir.exists()) {
                long now = System.currentTimeMillis();
                File[] oldFiles = cacheDir.listFiles((dir, name) -> name.startsWith("pending_export_") && name.endsWith(".tmp"));
                if (oldFiles != null) {
                    for (File f : oldFiles) {
                        if (now - f.lastModified() > STALE_FILE_THRESHOLD_MS) {
                            f.delete();
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // Stale file cleanup is best-effort
        }
    }
}
