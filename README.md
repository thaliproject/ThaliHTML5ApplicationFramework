Thali HTML5 Application Framework (THAF)
========================================

A toolkit that takes a HTML5 app and packages it with Thali capabilities for Android, Linux, Mac and Windows

To build desktop application
----------------------------
On first build various dependencies must be retrieved and any existing npm install/bower install will run on web application.  Future builds should be significantly faster.

Both android and desktop builds will force a build of the web project as a prerequisite.

>gradlew installApp

To build desktop and Android
----------------------------
>gradlew buildAll

To run desktop application
--------------------------
Start the TDH, then

Windows
>enlistment/Java/build/install/ThaliClientJava/bin/ThaliClientJava.bat

Linux/OSX
>enlistment/Java/build/install/ThaliClientJava/bin/ThaliClientJava

If the TDH is not already running, the application will crash.  To exit the application press any key in the console window.

To open in IntelliJ
-------------------
Import the root build.gradle file.  When prompted, choose to use custom gradle wrapper.  Leverage the Gradle Tasks view in IntelliJ to execute tasks.

To make debugging work you need to get IntelliJ to run the copyWebForDebug gradle task or you won't have the right web files during your debug run. To fix this go to Run->Edit Configurations. Hit the green "+" and choose Gradle. Give the task a useful name like "copyWebForDebug". Hit the folder button next to "Gradle project" and choose ":java". In tasks type in "copyWebForDebug". Hit o.k. Now select the task from the task drop down on the right side of your IDE and make sure it runs.

Now go back to Run->Edit Configurations, hit the green "+" and choose application. Give it a useful name like ProxyDesktop. Hit the "..." button by Main class and choose ProxyDesktop. Go to 'use classpath of module' and hit the dropdown and select Java. Look for the section that says "Before launch: Make" and hit the green arrow and choose "Run another Configuration" which will bring up a dialog which should list "copyWebForDebug', select it and hit o.k. Now hit o.k. on the main dialog to save and exit.

Now go to the task drop down in the uypper left hand part of the IDE window and make sure it's set to ProxyDesktop and hit the bug. Now (assuming you remembered to start up a TDH) things should work.

To add a website
----------------
Any HTML5 web application can be placed into 
>enlistment/web/src

The web build supports an NPM/Bower build.  The package.json and bower.json live in /web.  During build time bower install will run and deposit bower files in /web/src/bower_components

To customize Android app metadata
---------------------------------
/web/src/manifest.json and icon.png can be updated as needed to change application name or icon.

Ports
-----
The ports are currently fixed.  

The Relay is running on :58000
The webserver runs on :58001

You can run your HTML5 app elsewhere if helpful during development, as long as it looks for the relay/TDH at localhost:58000.

