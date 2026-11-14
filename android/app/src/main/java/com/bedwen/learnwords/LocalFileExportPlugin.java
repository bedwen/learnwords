package com.bedwen.learnwords;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalFileExport")
public class LocalFileExportPlugin extends Plugin {

    private static final long STALE_FILE_THRESHOLD_MS = 3600000L; // 1 hour
    private static final int BUFFER_SIZE = 8192;
    private static final String TEMP_FILE_PREFIX = "pending_export_";
    private static final String TEMP_FILE_SUFFIX = ".tmp";
    private static final String KEY_TEMP_FILE_NAME = "tempFileName";

    private static final ExecutorService IO_EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "LocalFileExport-IO");
        thread.setDaemon(true);
        return thread;
    });

    private String pendingTempFileName;
    private String lastCallId;

    @PluginMethod
    public void saveFile(PluginCall call) {
        if (call == null) {
            return;
        }

        String filename = call.getString("filename");
        String content = call.getString("content");
        String rawMimeType = call.getString("mimeType", "application/octet-stream");

        // R1: Immediately purge the full content string from call.getData() so Capacitor's
        // Bridge.saveInstanceState() does not serialize the payload into outState (preventing TransactionTooLargeException)
        if (call.getData() != null) {
            call.getData().remove("content");
        }

        String cleanMimeType = "application/octet-stream";
        if (rawMimeType != null && !rawMimeType.trim().isEmpty()) {
            String baseMime = rawMimeType.split(";")[0].trim();
            if (!baseMime.isEmpty() && baseMime.contains("/") && !baseMime.startsWith("/") && !baseMime.endsWith("/")) {
                cleanMimeType = baseMime;
            }
        }

        if (filename == null || filename.trim().isEmpty() || content == null || content.isEmpty()) {
            call.reject("Missing filename or content");
            return;
        }

        String safeFilename = filename.replaceAll("[/\\\\\\u0000\\r\\n\\t:*?\"<>|]", "_").trim();
        if (safeFilename.isEmpty() || safeFilename.matches("^\\.*$")) {
            safeFilename = "export.txt";
        }

        cleanUpStaleTempFiles();

        String callbackId = call.getCallbackId();
        this.lastCallId = callbackId;
        String safeId = (callbackId != null && !callbackId.isEmpty() && !PluginCall.CALLBACK_ID_DANGLING.equals(callbackId) && !"-1".equals(callbackId))
            ? callbackId.replaceAll("[^a-zA-Z0-9_-]", "_")
            : UUID.randomUUID().toString().replace("-", "");
        if (safeId.isEmpty()) {
            safeId = UUID.randomUUID().toString().replace("-", "");
        }
        String tempFileName = TEMP_FILE_PREFIX + safeId + TEMP_FILE_SUFFIX;

        this.pendingTempFileName = tempFileName;
        // R2: Persist tempFileName inside call.getData() so that it survives Bridge.restoreInstanceState
        if (call.getData() != null) {
            call.getData().put(KEY_TEMP_FILE_NAME, tempFileName);
        }

        File tempFile = getPendingTempFile(call);
        if (tempFile == null) {
            this.pendingTempFileName = null;
            if (this.lastCallId != null && this.lastCallId.equals(callbackId)) {
                this.lastCallId = null;
            }
            if (call.getData() != null) {
                call.getData().remove(KEY_TEMP_FILE_NAME);
            }
            call.reject("Invalid plugin call state: unable to resolve temporary file");
            return;
        }

        try (FileOutputStream fos = new FileOutputStream(tempFile)) {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
            fos.flush();
            try {
                if (fos.getFD() != null) {
                    fos.getFD().sync();
                }
            } catch (Throwable ignored) {
                // Best-effort fd sync on cache temp file
            }
        } catch (IOException e) {
            if (tempFile.exists()) {
                tempFile.delete();
            }
            this.pendingTempFileName = null;
            if (this.lastCallId != null && this.lastCallId.equals(callbackId)) {
                this.lastCallId = null;
            }
            if (call.getData() != null) {
                call.getData().remove(KEY_TEMP_FILE_NAME);
            }
            call.reject("Failed to create temporary export file: " + e.getMessage(), e);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(cleanMimeType);
        intent.putExtra(Intent.EXTRA_TITLE, safeFilename);

        try {
            startActivityForResult(call, intent, "handleCreateDocumentResult");
        } catch (Throwable e) {
            if (tempFile.exists()) {
                tempFile.delete();
            }
            if (this.pendingTempFileName != null && this.pendingTempFileName.equals(tempFileName)) {
                this.pendingTempFileName = null;
            }
            if (this.lastCallId != null && this.lastCallId.equals(callbackId)) {
                this.lastCallId = null;
            }
            if (call.getData() != null) {
                call.getData().remove(KEY_TEMP_FILE_NAME);
            }
            call.reject("Failed to launch document picker: " + e.getMessage(), e instanceof Exception ? (Exception) e : new Exception(e));
            cleanUpCall(call);
        }
    }

    @Override
    protected Bundle saveInstanceState() {
        String tempName = this.pendingTempFileName;
        if (tempName == null && this.lastCallId != null && bridge != null) {
            PluginCall savedCall = bridge.getSavedCall(this.lastCallId);
            if (savedCall != null && savedCall.getData() != null) {
                tempName = savedCall.getData().getString(KEY_TEMP_FILE_NAME);
            }
        }
        if (tempName == null && bridge != null) {
            try {
                Field field = bridge.getClass().getDeclaredField("pluginCallForLastActivity");
                field.setAccessible(true);
                Object lastCall = field.get(bridge);
                if (lastCall instanceof PluginCall) {
                    PluginCall pc = (PluginCall) lastCall;
                    if (pc.getData() != null) {
                        tempName = pc.getData().getString(KEY_TEMP_FILE_NAME);
                    }
                }
            } catch (Throwable ignored) {
            }
        }
        if (tempName == null) {
            return null;
        }
        Bundle ret = new Bundle();
        ret.putString(KEY_TEMP_FILE_NAME, tempName);
        return ret;
    }

    @Override
    protected void restoreState(Bundle state) {
        super.restoreState(state);
        if (state != null) {
            String restored = state.getString(KEY_TEMP_FILE_NAME);
            if (restored != null && !restored.trim().isEmpty()) {
                this.pendingTempFileName = sanitizeTempFileName(restored);
            }
        }
    }

    @ActivityCallback
    public void handleCreateDocumentResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            if (result != null && result.getData() != null && result.getData().getData() != null) {
                ContentResolver resolver = getContext() != null ? getContext().getContentResolver() : null;
                deletePartialDocument(resolver, result.getData().getData());
            }
            if (this.pendingTempFileName != null) {
                Context context = getContext();
                if (context != null && context.getCacheDir() != null) {
                    File temp = new File(context.getCacheDir(), this.pendingTempFileName);
                    if (temp.exists()) {
                        temp.delete();
                    }
                }
                this.pendingTempFileName = null;
            }
            this.lastCallId = null;
            clearPluginCallForLastActivity(null);
            return;
        }

        final File tempFile = getPendingTempFile(call);

        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            if (result != null && result.getData() != null && result.getData().getData() != null) {
                ContentResolver resolver = getContext() != null ? getContext().getContentResolver() : null;
                deletePartialDocument(resolver, result.getData().getData());
            }
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
            JSObject ret = new JSObject();
            ret.put("saved", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            cleanUpCall(call);
            return;
        }

        final Uri uri = result.getData().getData();
        final ContentResolver resolver = getContext() != null ? getContext().getContentResolver() : null;

        // R3: If the temporary file is missing or empty, delete the 0-byte document created by DocumentsUI before rejecting
        if (tempFile == null || !tempFile.exists() || tempFile.length() == 0) {
            deletePartialDocument(resolver, uri);
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
            call.reject("Export temporary file not found or empty");
            cleanUpCall(call);
            return;
        }

        if (resolver == null) {
            deletePartialDocument(resolver, uri);
            if (tempFile.exists()) {
                tempFile.delete();
            }
            call.reject("ContentResolver unavailable");
            cleanUpCall(call);
            return;
        }

        IO_EXECUTOR.execute(() -> {
            boolean writeSuccess = false;
            try {
                try (InputStream in = new FileInputStream(tempFile)) {
                    OutputStream out = openTruncatedOutputStream(resolver, uri);
                    if (out == null) {
                        deletePartialDocument(resolver, uri);
                        call.reject("Failed to open destination output stream");
                        return;
                    }
                    try {
                        byte[] buffer = new byte[BUFFER_SIZE];
                        int bytesRead;
                        while ((bytesRead = in.read(buffer)) != -1) {
                            out.write(buffer, 0, bytesRead);
                        }
                        out.flush();
                        if (out instanceof FileOutputStream) {
                            try {
                                FileOutputStream fos = (FileOutputStream) out;
                                if (fos.getFD() != null) {
                                    fos.getFD().sync();
                                }
                            } catch (Throwable ignored) {
                                // Underlying storage / provider may not support sync
                            }
                        }
                    } finally {
                        out.close();
                    }
                }
                writeSuccess = true;
            } catch (Throwable t) {
                deletePartialDocument(resolver, uri);
                call.reject("Failed to save exported file: " + t.getMessage(), t instanceof Exception ? (Exception) t : new Exception(t));
                return;
            } finally {
                if (tempFile != null && tempFile.exists()) {
                    tempFile.delete();
                }
                if (!writeSuccess) {
                    cleanUpCall(call);
                }
            }

            // R3: OutputStream is completely closed before calling call.resolve(ret).
            // Only resolve after writeSuccess is verified so document is never deleted if resolution encounters an issue.
            try {
                JSObject ret = new JSObject();
                ret.put("saved", true);
                ret.put("cancelled", false);
                ret.put("uri", uri.toString());
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Failed to resolve export result: " + t.getMessage(), t instanceof Exception ? (Exception) t : new Exception(t));
            } finally {
                cleanUpCall(call);
            }
        });
    }

    private OutputStream openTruncatedOutputStream(ContentResolver resolver, Uri uri) throws FileNotFoundException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                OutputStream os = resolver.openOutputStream(uri, "wt");
                if (os != null) {
                    return os;
                }
            } catch (Throwable ignored) {
                // Fall back to standard openOutputStream if "wt" mode is unsupported by provider
            }
        }
        return resolver.openOutputStream(uri);
    }

    private void deletePartialDocument(ContentResolver resolver, Uri uri) {
        if (uri == null) {
            return;
        }
        ContentResolver res = resolver;
        if (res == null && getContext() != null) {
            res = getContext().getContentResolver();
        }
        if (res == null) {
            return;
        }
        try {
            if (DocumentsContract.deleteDocument(res, uri)) {
                return;
            }
        } catch (Throwable ignored) {
            // Best-effort document deletion via DocumentsContract
        }
        try {
            res.delete(uri, null, null);
        } catch (Throwable ignored) {
            // Fallback content resolver delete
        }
    }

    private void cleanUpCall(PluginCall call) {
        if (call != null) {
            boolean isMatchingCall = false;
            if (call.getData() != null) {
                String callTempName = call.getData().getString(KEY_TEMP_FILE_NAME);
                if (callTempName != null && callTempName.equals(this.pendingTempFileName)) {
                    isMatchingCall = true;
                }
            }
            if (call.getCallbackId() != null && call.getCallbackId().equals(this.lastCallId)) {
                isMatchingCall = true;
            }
            if (isMatchingCall) {
                this.pendingTempFileName = null;
                this.lastCallId = null;
            }
        } else {
            this.pendingTempFileName = null;
            this.lastCallId = null;
        }
        if (call != null && bridge != null) {
            try {
                call.release(bridge);
            } catch (Throwable ignored) {
            }
        }
        clearPluginCallForLastActivity(call);
    }

    private void clearPluginCallForLastActivity(PluginCall call) {
        if (bridge == null) {
            return;
        }
        try {
            Field field = bridge.getClass().getDeclaredField("pluginCallForLastActivity");
            field.setAccessible(true);
            Object current = field.get(bridge);
            if (current == null || current == call || (call != null && call.equals(current))) {
                field.set(bridge, null);
            }
        } catch (Throwable ignored) {
            try {
                Method method = bridge.getClass().getDeclaredMethod("setPluginCallForLastActivity", PluginCall.class);
                method.setAccessible(true);
                method.invoke(bridge, (PluginCall) null);
            } catch (Throwable ignored2) {
            }
        }
    }

    private String sanitizeTempFileName(String rawName) {
        if (rawName == null) {
            return null;
        }
        String nameOnly = new File(rawName).getName().trim();
        if (nameOnly.isEmpty() || nameOnly.contains("..") || nameOnly.contains("/") || nameOnly.contains("\\") || nameOnly.contains("\u0000")) {
            return null;
        }
        if (!nameOnly.startsWith(TEMP_FILE_PREFIX) || !nameOnly.endsWith(TEMP_FILE_SUFFIX)) {
            return null;
        }
        return nameOnly;
    }

    private File getPendingTempFile(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            return null;
        }
        File cacheDir = context.getCacheDir();
        if (cacheDir == null) {
            return null;
        }

        String candidate = null;
        if (call != null && call.getData() != null) {
            candidate = sanitizeTempFileName(call.getData().getString(KEY_TEMP_FILE_NAME));
        }
        if (candidate == null && this.pendingTempFileName != null) {
            candidate = sanitizeTempFileName(this.pendingTempFileName);
        }
        if (candidate == null && call != null) {
            String callbackId = call.getCallbackId();
            if (callbackId != null && !callbackId.isEmpty() && !PluginCall.CALLBACK_ID_DANGLING.equals(callbackId) && !"-1".equals(callbackId)) {
                String safeCallbackId = callbackId.replaceAll("[^a-zA-Z0-9_-]", "_");
                candidate = TEMP_FILE_PREFIX + safeCallbackId + TEMP_FILE_SUFFIX;
            }
        }

        if (candidate == null) {
            return null;
        }

        File resolved = new File(cacheDir, candidate);
        try {
            String canonicalCacheDir = cacheDir.getCanonicalPath();
            String canonicalResolved = resolved.getCanonicalPath();
            String prefix = canonicalCacheDir.endsWith(File.separator) ? canonicalCacheDir : canonicalCacheDir + File.separator;
            if (!canonicalResolved.startsWith(prefix)) {
                return null;
            }
        } catch (IOException e) {
            return null;
        }

        return resolved;
    }

    private void cleanUpStaleTempFiles() {
        try {
            Context context = getContext();
            if (context == null) {
                return;
            }
            File cacheDir = context.getCacheDir();
            if (cacheDir != null && cacheDir.exists()) {
                long now = System.currentTimeMillis();
                File[] oldFiles = cacheDir.listFiles((dir, name) -> name.startsWith(TEMP_FILE_PREFIX) && name.endsWith(TEMP_FILE_SUFFIX));
                if (oldFiles != null) {
                    for (File f : oldFiles) {
                        if (now - f.lastModified() > STALE_FILE_THRESHOLD_MS) {
                            f.delete();
                        }
                    }
                }
            }
        } catch (Throwable ignored) {
            // Stale file cleanup is best-effort
        }
    }
}
