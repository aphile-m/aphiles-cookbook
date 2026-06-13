package com.tshandu.potjie;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.util.Base64;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Cold start: the WebView needs time to load the app before it can receive the event
        handleShareIntent(getIntent(), 3000);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShareIntent(intent, 500);
    }

    private void handleShareIntent(Intent intent, int delayMs) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null) return;

        if (type.startsWith("text/")) {
            final String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null || text.trim().isEmpty()) return;
            new Handler(getMainLooper()).postDelayed(() -> triggerEvent("shared-text", text), delayMs);
        } else if (type.startsWith("image/")) {
            final Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null) return;
            new Handler(getMainLooper()).postDelayed(() -> {
                new Thread(() -> {
                    final String b64 = readScaledJpegBase64(uri);
                    if (b64 != null) {
                        runOnUiThread(() -> triggerEvent("shared-image", b64));
                    }
                }).start();
            }, delayMs);
        }
    }

    private void triggerEvent(String name, String payload) {
        try {
            String js = "window.dispatchEvent(new CustomEvent('" + name + "', { detail: "
                    + JSONObject.quote(payload) + " }))";
            bridge.getWebView().evaluateJavascript(js, null);
        } catch (Exception ignored) {
        }
    }

    /** Decode a shared image, downscale to max 2000px, re-encode as JPEG base64. */
    private String readScaledJpegBase64(Uri uri) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream is = getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(is, null, bounds);
            }
            int maxDim = Math.max(bounds.outWidth, bounds.outHeight);
            if (maxDim <= 0) return null;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = 1;
            while (maxDim / opts.inSampleSize > 2000) opts.inSampleSize *= 2;
            Bitmap bmp;
            try (InputStream is = getContentResolver().openInputStream(uri)) {
                bmp = BitmapFactory.decodeStream(is, null, opts);
            }
            if (bmp == null) return null;
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, bos);
            bmp.recycle();
            return Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }
}
