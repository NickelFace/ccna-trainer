package com.nickelface.ccnatrainer;

// Native ACTION_SEND wrapper. Capacitor's stock Share plugin can attach files, but only
// from a file:// URI — and the question images live inside the APK as assets, which have
// no file:// path. This plugin copies the asset into the app cache, exposes it through
// the FileProvider that AndroidManifest.xml already declares, and hands the whole thing
// to the system share sheet in one call.
//
// Contract from JS (screens/ai-prompt.js):
//   ShareIntent.share({ text, imageAssetPath?, title? })
// - text is EXTRA_TEXT always (the assembled AI prompt).
// - imageAssetPath is a relative path under assets/public/ (e.g. "images/exhibits/q1.jpg").
//   When present we set type = "image/*" and EXTRA_STREAM to the FileProvider URI.
// - When it is missing we send type = "text/plain" with EXTRA_TEXT only — no empty
//   attachment slot in the share sheet.
// FLAG_GRANT_READ_URI_PERMISSION is set on both the payload and the chooser so every
// target the user picks can read the temp file.

import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text", "");
        String imageAssetPath = call.getString("imageAssetPath");
        String title = call.getString("title", "Разобрать с ИИ");

        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.putExtra(Intent.EXTRA_TEXT, text);

            boolean hasImage = false;
            if (imageAssetPath != null && !imageAssetPath.isEmpty()) {
                Uri uri = copyAssetToCacheAndGetUri(imageAssetPath);
                if (uri != null) {
                    send.setType("image/*");
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    // clipData carries the URI grant across the chooser to every target.
                    send.setClipData(android.content.ClipData.newRawUri(null, uri));
                    hasImage = true;
                }
            }
            if (!hasImage) {
                send.setType("text/plain");
            }

            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (hasImage) chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("shared", true);
            ret.put("withImage", hasImage);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage(), e);
        }
    }

    // Capacitor packs the web bundle under assets/public/, so a question image bundled
    // at src/app/screens/... referencing "images/exhibits/q1.jpg" lives at
    // assets/public/images/exhibits/q1.jpg on the device.
    private Uri copyAssetToCacheAndGetUri(String assetRelativePath) throws Exception {
        String assetPath = "public/" + assetRelativePath;
        AssetManager am = getContext().getAssets();

        File cacheShared = new File(getContext().getCacheDir(), "shared");
        if (!cacheShared.exists() && !cacheShared.mkdirs()) {
            throw new Exception("could not create cache/shared");
        }
        String fileName = new File(assetRelativePath).getName();
        File out = new File(cacheShared, fileName);

        try (InputStream in = am.open(assetPath); OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        }

        String authority = getContext().getPackageName() + ".fileprovider";
        return FileProvider.getUriForFile(getContext(), authority, out);
    }
}
