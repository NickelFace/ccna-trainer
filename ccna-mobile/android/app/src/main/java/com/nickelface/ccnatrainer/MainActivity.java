package com.nickelface.ccnatrainer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom native plugins must be registered before super.onCreate — the Bridge
        // walks the registered list to build the JS interface for the WebView.
        registerPlugin(ShareIntentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
