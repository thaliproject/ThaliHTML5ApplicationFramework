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

"use strict";

// TDH and db information
var localCouchInstance = "http://localhost:58000";
var testDb1Name = "testdbone";
var testDb2Name = "testdbtwo";

// random constants
var stringFiller = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var maxDocLen = 128;
var maxDocCount = 100;

function random(min, max) {
    if (min > max) {
        t = max;
        max = min;
        min = t;
    }
    return Math.floor(Math.random() * (max - min) + min);
}

function docBody(len) {
    var s = '';

    for(var a = 0; a < len; ) {
        var toCopy = (stringFiller.length > (len-a)) ? (len-a) : stringFiller.length;
        s = s + stringFiller.substr(0, toCopy);
        a += toCopy;
    }

    return s;
}

function generateDoc() {
    var len = random(1, maxDocLen);
    var body = docBody(len);
    return {
        len: len,
        body: body,
        md5: md5(body, false, false)
    };
}

function generateDocs(count) {
    var docBag = [];
    for(var i = 0; i < count; i++) {
        docBag[docBag.length] = generateDoc();
    }
    return docBag;
}

/**
 * Logs both from the Timeline function and in the general log
 * @param message
 */
function doubleLog(message) {
    console.timeStamp(message);
    console.log(message);
}

function docsMatch(db1, db2, resultCallback) {
    var db1Rows, db2Rows;

    db1.allDocs({include_docs: true}, function(err, resp) {
        if(err != null) {
            doubleLog("Unable to load docs from first database.");
            resultCallback(false);
        } else {
            db1Rows = resp.rows;
            db2.allDocs({include_docs: true}, function(err, resp) {
                if(err != null) {
                    doubleLog("Unable to load docs from second database.");
                    resultCallback(false);
                } else {
                    db2Rows = resp.rows;
                    if (db1Rows.length != db2Rows.length) {
                        doubleLog("Length of rows are not the same.  Db1: " + db1Rows.length + ", Db2: " + db2Rows.length);
                        resultCallback(false);
                    } else {
                        var allGood = false;
                        var i = 0;
                        var getDoc = function(err, resp) {
                            if(err) {
                                doubleLog("Failure retrieving doc.  Id: " + db1Rows[i].id);
                                resultCallback(false);
                            } else {
                                // let's verify the contents of the doc
                                if(resp.len == db1Rows[i].doc.len &&
                                        resp.md5 == db1Rows[i].doc.md5 &&
                                        md5(resp.body, false, false) == resp.md5) {
                                    i++;
                                    if (i < db1Rows.length) {
                                        db2.get(db1Rows[i].id, getDoc);
                                    } else {
                                        resultCallback(true);
                                    }
                                } else {
                                    doubleLog("Document mismatch.  Id: " + db1Rows[i].id);
                                    resultCallback(false);
                                }
                            }
                        };
                        db2.get(db1Rows[0].id, getDoc);
                    }
                }
            });
        }
    });
}

function replicationToTest(db1, db2, resultCallback) {
    var dbOne, dbTwo;
    var docBag = generateDocs(random(1, maxDocCount));
    var success = false;

    PouchDB.destroy(db1, function(err, resp) {
        if(err != null) {
            doubleLog("Failed to destroy " + db1);
            resultCallback(false);
        } else {
            PouchDB.destroy(db2, function(err, resp) {
                if(err != null) {
                    doubleLog("Failed to destroy " + db2);
                    resultCallback(false);
                } else {
                    dbOne = new PouchDB(db1);
                    dbTwo = new PouchDB(db2);
                    dbOne.bulkDocs({docs: docBag}, function(err, resp) {
                        dbOne.replicate.to(dbTwo, { create_target: true, server: false }, function(err, resp) {
                            if(err != null) {
                                doubleLog("Failed to replicate " + db1 + " --> " + db2);
                                resultCallback(false);
                            } else {
                                docsMatch(dbOne, dbTwo, resultCallback);
                            }
                        });
                    });
                }
            });
        }
    });
}

function replicationFromTest(db1, db2, resultCallback) {
    var dbOne, dbTwo;
    var docBag = generateDocs(random(1, maxDocCount));
    var success = false;

    PouchDB.destroy(db1, function(err, resp) {
        if(err != null) {
            doubleLog("Failed to destroy " + db1);
            resultCallback(false);
        } else {
            PouchDB.destroy(db2, function(err, resp) {
                if(err != null) {
                    doubleLog("Failed to destroy " + db2);
                    resultCallback(false);
                } else {
                    dbOne = new PouchDB(db1);
                    dbTwo = new PouchDB(db2);
                    dbOne.bulkDocs({docs: docBag}, function(err, resp) {
                        dbTwo.replicate.from(dbOne, { create_target: true, server: false }, function(err, resp) {
                            if(err != null) {
                                doubleLog("Failed to replicate " + db2 + " <-- " + db1);
                                resultCallback(false);
                            } else {
                                docsMatch(dbOne, dbTwo, resultCallback);
                            }
                        });
                    });
                }
            });
        }
    });
}

var testConfigs = [
    {
        name: "local-to-local",
        db1:  testDb1Name,
        db2:  testDb2Name
    },
    {
        name: "local-to-remote",
        db1:  testDb1Name,
        db2:  localCouchInstance + "/" + testDb2Name
    },
    {
        name: "remote-to-local",
        db1:  localCouchInstance + "/" + testDb1Name,
        db2:  testDb2Name
    }
];

function doTest(name, testFunction, testConfigs, finishedCallback) {
    if (testConfigs == null || testConfigs.length == 0) {
        finishedCallback();
        return;
    }

    var currentTest = testConfigs[0];
    function setTestResultAndDoNext(result) {
        currentTest[name + "-" + currentTest.name + "-result"] = result;
        doTest(name, testFunction, testConfigs.slice(1), finishedCallback);
    }

    testFunction(currentTest.db1, currentTest.db2, setTestResultAndDoNext);
}

function printResult() {
    var outputString = "";
    testConfigs.forEach(function(config) {
        var testName = config.name;
        for (var entry in config) {
            if (config.hasOwnProperty(entry)) {
                if (entry.indexOf(testName+"-result") != -1) {
                    var resultStr = entry + ": " + config[entry]
                    doubleLog(resultStr);
                    outputString = outputString.concat(resultStr, "<br>");
                }
            }
        }
    });
    $( "#output" ).html(outputString);
}

function testReplicationTo(finishedCallback)
{
    doTest("replication-to", replicationToTest, testConfigs, finishedCallback);
}

function testReplicationFrom(finishedCallback)
{
    doTest("replication-from", replicationFromTest, testConfigs, finishedCallback);
}

$(function() {
    testReplicationTo(function() {
        testReplicationFrom(printResult);
    });
});


