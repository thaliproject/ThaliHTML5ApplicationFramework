/*
Copyright (c) Microsoft Open Technologies, Inc.
All Rights Reserved
Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED,
INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache 2 License for the specific language governing permissions and limitations under the License.
*/

 package com.msopentech.ThaliClient;

import android.content.*;
import android.os.Bundle;
import com.msopentech.ThaliAndroidClientUtilities.AndroidEktorpCreateClientBuilder;
import com.msopentech.thali.CouchDBListener.HttpKeyTypes;
import com.msopentech.thali.relay.RelayWebServer;
import com.msopentech.thali.utilities.universal.HttpKeyURL;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.xwalk.app.runtime.extension.XWalkExtensionClient;
import org.xwalk.app.runtime.extension.XWalkExtensionContextClient;

import java.io.IOException;

public class ProxyExtensionClient extends XWalkExtensionClient {
    // These values are taken from ThaliDeviceHubService in the Android TDH, it doesn't seem useful to put
    // in a dependency just to get two strings so I copied them over.
    public static final String HttpKeysNotification = "com.msopentech.thali.devicehub.android.httpkeys";
    public static final String LocalMachineIPHttpKeyURLName = "LocalMachineIPHttpKeyURL";
    public static final String TDHClassName = "com.msopentech.thali.devicehub.android.ThaliDeviceHubService";

    private static final Logger LOG = LoggerFactory.getLogger(ProxyExtensionClient.class);
    private volatile ContentResolver resolver;
    private volatile Context context;
    private volatile RelayWebServer server;

    private BroadcastReceiver broadcastReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            LOG.info("In onReceive on the broadcastReceiver in ProxyExtensionClient");
            Bundle bundle = intent.getExtras();
            final HttpKeyTypes httpKeyTypes = new HttpKeyTypes(new HttpKeyURL(bundle.getString(LocalMachineIPHttpKeyURLName)));
            // I explicitly didn't use an AsyncTask for this because the Android docs say that an AsyncTask
            // should only take a few seconds at most and starting a network port can take awhile.
            new Thread(new Runnable() {
                @Override
                public void run() {
                    initialize(httpKeyTypes);
                }
            }).start();
        }
    };

    public ProxyExtensionClient(String name, String jsApiContent, XWalkExtensionContextClient xwalkContext) {
        super(name, jsApiContent, xwalkContext);
        LOG.info("Entered ProxyExtensionClient");
        this.resolver = xwalkContext.getContext().getContentResolver();
        this.context = xwalkContext.getContext();
//        new RelayTask().execute(xwalkContext.getContext());
    }

    private synchronized void initialize(HttpKeyTypes httpKeyTypes)
    {
        LOG.info("Inside initialize");
        if (server != null) {
            if (server.isAlive()) {
                LOG.info("Server is alive so updated httpkeytypes");
                server.setHttpKeyTypes(httpKeyTypes);
                return;
            } else {
                // This is probably not necessary but one likes to be clean in these things
                LOG.info("Stopping relay server in initialize because it wasn't alive before recreating");
                server.stop();
            }
        }

        LOG.info("Trying to initialize RelayWebServer");
        // Start the webserver
        try {
            server = new RelayWebServer(
                    new AndroidEktorpCreateClientBuilder(),
                    context.getDir("keystore", Context.MODE_PRIVATE), httpKeyTypes);
        } catch (Exception e) {
            LOG.error("Could not created RelayWebServer!", e);
            return;
        }

        try {
            server.start();
        } catch(IOException ioe) {
            LOG.error("Could not start RelayWebServer!", ioe);
        }
        LOG.info("RelayWebServer seems to have started.");
    }

    // Stop the server
    @Override
    public void onDestroy()
    {
        super.onDestroy();
        if (server != null) {
            server.stop();
        }
    }

    @Override
    public void onPause() {
        LOG.info("Called in onPause");
        context.unregisterReceiver(broadcastReceiver);
    }

    @Override
    public void onResume() {
        // This should wake up the TDH if it's not already awake and get it to send a broadcast intent
        // with the local address.
        LOG.info("Called in onResume");
        context.registerReceiver(broadcastReceiver, new IntentFilter(HttpKeysNotification));
        Intent startTDHIntent = new Intent(TDHClassName);
        context.startService(startTDHIntent);
        LOG.info("Finished onResume");
    }
//    private class RelayTask extends AsyncTask<Context, Void, Void> {
//        private Context context;
//
//        protected Void doInBackground(Context... context) {
//            if (context.length >= 0)
//            this.context = context[0];
//            initialize();
//            return null;
//        }
//
//    }

}
