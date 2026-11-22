package com.esaedev.aeha;

import android.app.Activity;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

public final class LauncherActivity extends Activity {
    private FrameLayout content;
    private WebView webView;
    private OnBackInvokedCallback backCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri startUrl = Uri.parse(getString(R.string.start_url));
        content = new FrameLayout(this);
        content.setBackgroundColor(getColor(R.color.backgroundColor));
        if (Build.VERSION.SDK_INT >= 35) {
            // Edge-to-edge is mandatory here. Keep both system bars and the keyboard off the app controls.
            content.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        webView = new WebView(this);
        webView.setBackgroundColor(getColor(R.color.backgroundColor));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                return !startUrl.getScheme().equals(url.getScheme())
                        || !startUrl.getEncodedAuthority().equalsIgnoreCase(url.getEncodedAuthority())
                        || url.getEncodedPath() == null
                        || !url.getEncodedPath().startsWith(startUrl.getEncodedPath());
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                updateSystemBack();
            }
        });
        content.addView(webView);
        setContentView(content);
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(startUrl.toString());
        }
        updateSystemBack();
    }

    private void updateSystemBack() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (webView.canGoBack() && backCallback == null) {
            backCallback = webView::goBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        } else if (!webView.canGoBack() && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        webView.saveState(state);
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
        content.removeView(webView);
        webView.destroy();
        super.onDestroy();
    }
}
