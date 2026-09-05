package com.example.homemaintenance;

import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        WebSettings webSettings = webView.getSettings();
        // Google Identity Services opens the consent screen in a new window; without this the WebView shows a blank page.
        webSettings.setSupportMultipleWindows(true);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                // Load the popup's content inside the same WebView instead of opening a separate window.
                WebView transport = new WebView(view.getContext());
                transport.setWebViewClient(new android.webkit.WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView childView, String url) {
                        view.loadUrl(url);
                        return true;
                    }
                });
                WebView.WebViewTransport webViewTransport = (WebView.WebViewTransport) resultMsg.obj;
                webViewTransport.setWebView(transport);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }
}
