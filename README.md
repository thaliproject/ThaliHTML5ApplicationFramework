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
Import the root build.gradle file.  When prompted, choose to use custom gradle wrapper.  Leverage the Gradle Tasks view in IntelliJ to execute tasks.  Debug using the 'java->run' Gradle task.  Note that after debugging you may need to manually kill left over java processes not terminated in non-console execution modes.

To add a website
----------------
Any HTML5 web application can be placed into 
>enlistment/web/src

The web build supports an NPM/Bower build.  The package.json and bower.json live in /web.  During build time bower install will run and deposit bower files in /web/src/bower_components

To customize Android app metadata
---------------------------------
/web/src/manifest.json and icon.png can be updated as needed to change application name or icon.
