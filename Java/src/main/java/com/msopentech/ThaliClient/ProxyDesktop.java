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

import com.fasterxml.jackson.core.JsonParseException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.msopentech.thali.CouchDBListener.HttpKeyTypes;
import com.msopentech.thali.CouchDBListener.ThaliListener;
import com.msopentech.thali.nanohttp.SimpleWebServer;
import com.msopentech.thali.relay.RelayWebServer;
import com.msopentech.thali.utilities.java.JavaEktorpCreateClientBuilder;

import java.awt.*;
import java.io.Console;
import java.io.File;
import java.net.MalformedURLException;
import java.nio.file.Paths;
import java.nio.file.Path;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Properties;

// TODO: Convert this to trivial swing app which goes to system tray
// per http://docs.oracle.com/javase/tutorial/uiswing/misc/systemtray.html

public class ProxyDesktop  {
    private static final int localWebserverPort = 58001;

    public RelayWebServer server;
    public SimpleWebServer host;

    public static void main(String[] rgs) throws InterruptedException, URISyntaxException, IOException {

        final ProxyDesktop instance = new ProxyDesktop();
        instance.initialize();

        // Attempt to launch the default browser to our page
        if(Desktop.isDesktopSupported())
        {
            Desktop.getDesktop().browse(new URI("http://localhost:" + localWebserverPort));
        }

        // Register to shutdown the server properly from a sigterm
        Runtime.getRuntime().addShutdownHook(new Thread()
        {
            @Override
            public void run()
            {
                instance.shutdown();
            }
        });

        // Let user press enter to kill the console session
        Console console = System.console();
        if (console != null) {
            console.format("\nPress ENTER to exit.\n");
            console.readLine();
            instance.shutdown();
        }
        else
        {
            // Don't exit on your own when running without a console (debugging in an IDE).
            while (true)
            {
                Thread.sleep(500);
            }
        }
    }

    public void shutdown()
    {
        server.stop();
        host.stop();
    }

    public void initialize() throws URISyntaxException, IOException {
        // Initialize the relay - We find the root directory of the install and navigate down to the web directory
        File rootDirectoryOfInstall = new File(getClass().getProtectionDomain().getCodeSource().getLocation().getFile());
        File webDirectory = rootDirectoryOfInstall.toPath().getParent().getParent().resolve("web").toFile();
        if (webDirectory.exists() == false) {
            throw new RuntimeException("Either the web directory wasn't installed or we have the wrong location or you are debugging AND DIDN'T READ THE README.md!!!!!!!! - " +
            webDirectory.getAbsolutePath());
        }

        // Useful for debugging
        // webPath = new File(new File(System.getProperty("user.dir")).getParent(), "web").toPath();

        // This is sleezy, we should really have a function that gets us the httpkeys file and share that
        // function with the Java TDH but I really don't want to put in a cross project dependency to share
        // a few strings.
        File httpKeysFileDirectory = new File(System.getProperty("user.home"), ".thaliTdh");
        File httpKeysFile = new File(httpKeysFileDirectory, "httpkeys");
        if (httpKeysFile.exists() == false) {
            throw new RuntimeException("We can't find the httpkeys file! Someone start up the TDH!!!!");
        }
        ObjectMapper mapper = new ObjectMapper();
        HttpKeyTypes httpKeyTypes = mapper.readValue(httpKeysFile, HttpKeyTypes.class);

        try {
            server = new RelayWebServer(new JavaEktorpCreateClientBuilder(), webDirectory, httpKeyTypes);
        } catch (Exception e) {
            throw new RuntimeException("cannot start relay web server!", e);
        }

        // Initialize the local web server
        System.out.println("Setting web root to: " + webDirectory.getAbsolutePath());
        host = new SimpleWebServer("localhost", localWebserverPort, webDirectory, false);

        // Start both listeners
        try {
            System.out.println("Starting WebServer at http://localhost:" + localWebserverPort);
            host.start();

            System.out.println("Starting Relay on http://" + RelayWebServer.relayHost + ":" + RelayWebServer.relayPort);
            server.start();
        } catch(IOException ioe) {
            System.out.println("Exception: " + ioe.toString());
        }
        System.out.println("Started.");
    }

}
