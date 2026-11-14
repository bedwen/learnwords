package com.bedwen.learnwords;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalFileExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
