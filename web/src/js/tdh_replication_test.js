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

(function(exports){

"use strict";

// TDH and db information
var localCouchInstance = TDHReplication.relayAddress;
var testDb1Name = "testdbone";
var testDb2Name = "testdbtwo";
var testDb3Name = "testdbthree";
var testDb4Name = "testdbfour";

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

var dbOne = testDb1Name;
var dbTwo = testDb2Name;
var dbTwoCouch = localCouchInstance + "/" + testDb2Name;
var dbThree = testDb3Name;
var dbThreeCouch = localCouchInstance + "/" + testDb3Name;
var dbFour = testDb4Name;
var dbFourCouch = localCouchInstance + "/" + testDb4Name;
var localHttpKeyUrl; // store the HTTPKEY URL with a local address
var publicHttpKeyUrl; // store the HTTPKEY URL with an onion address

var testDuration = 60; // seconds
var moreDocTimerTimeout = 3; // seconds
var moreDocTimerIterations = testDuration / moreDocTimerTimeout;
var syncDuration = 600; // seconds -- sync time allowed is padding after no more docs are added
var checkDocTimerDuration = 1; // seconds

var checkDocCountTimer;
var moreDocTimer;
var syncTimer = null;
var finishupTimer = null;

// get db counts, hand them to the callback
function checkSync(callback) {
    var db4 = new PouchDB(dbFourCouch);
    var db4Count;
    var db1Count;
    db4.allDocs({include_docs: false}, function(err, response) {
        if (err) {
            db4Count = -1;
        } else {
            db4Count = response["total_rows"];
        }
        var db1 = new PouchDB(dbOne);
        db1.allDocs({include_docs: false}, function (err, response) {
            if (err != null) {
                db1Count = -1;
            } else {
                db1Count = response["total_rows"];
            }

            if (callback) {
                callback(db1Count, db4Count);
            }
        });
    });
}

function addMoreDocs() {
    moreDocTimerIterations--;
    if(moreDocTimerIterations > 0) {
        var docBag = generateDocs(random(1, 100));
        var db = new PouchDB(dbOne);
        db.bulkDocs({docs: docBag}).then(function () {
            console.log("added: " + docBag.length);
        }).then(function () {
            return db.bulkDocs({docs: docBag});
        }).then(function () {
            moreDocTimer = setTimeout(addMoreDocs, moreDocTimerTimeout * 1000);
        });
    } else {
        moreDocTimer = null;
        syncTimer = setTimeout(function() {
            if(checkDocCountTimer != null) {
                clearTimeout(checkDocCountTimer);
            }
            checkSync(function(db1Count, db4Count) {
                if(db1Count != db4Count) {
                    $('#finish_output').html("Test completed -- all docs did not sync.");
                } else {
                    verifyDocs();
                }
            });
        }, syncDuration * 1000);
    }
}

function checkDocCount() {
    checkSync(function (db1Count, db4Count) {
        if (db1Count < 0) {
            $("#dbone_output").html("error getting doc count");
        } else {
            $("#dbone_output").html(db1Count);
        }
        if (db4Count < 0) {
            $("#dbfour_output").html("error getting doc count");
        } else {
            $("#dbfour_output").html(db4Count);
        }

        if ((syncTimer != null) && (db1Count == db4Count)) {
            clearTimeout(syncTimer);
            syncTimer = null;
            verifyDocs();
        } else {
            checkDocCountTimer = setTimeout(checkDocCount, checkDocTimerDuration * 1000);
        }
    });
}

function isDocPresent(doc, docList) {
    for(var i = 0; i < docList.length; i++) {
        if((docList[i]["_id"] == doc["_id"]) && (docList[i]["_rev"] == doc["_rev"])) {
            return true;
        }
    }
    return false;
}

function verifyDocs() {
    // disable replications
    PouchDBSync.removeReplicationRequest(dbOne, dbTwoCouch);
    PouchDBSync.removeReplicationRequest(dbTwo, localHttpKeyUrl + dbThree);
    TDHReplication.removeTdhReplicationRequest(dbThree, publicHttpKeyUrl + dbFour);

    // clear timers
    if(moreDocTimer != null) {
        clearTimeout(moreDocTimer);
    }
    if(syncTimer != null) {
        clearTimeout(syncTimer);
    }
    if(checkDocCountTimer != null) {
        clearTimeout(checkDocCountTimer)
    }
    moreDocTimer = syncTimer = checkDocCountTimer = null;

    // let's check the docs!
    var db4 = new PouchDB(dbFourCouch);
    db4.allDocs({include_docs: false}, function(err, response) {
        if (err) {
            $('#finish_output').html("Test completed with error -- unable to get count of docs from db4.");
        } else {
            var db4Docs = response["rows"];
            var db1 = new PouchDB(dbOne);
            db1.allDocs({include_docs: false}, function (err, response) {
                if (err != null) {
                    $('#finish_output').html("Test completed with error -- unable to get count of docs from db1.");
                } else {
                    var db1Docs = response["rows"];
                    if (db4Docs.length == db1Docs.length) {
                        for (var i = 0; i < db1Docs.length; i++) {
                            if(!isDocPresent(db1Docs[i], db4Docs)) {
                                $('#finish_output').html("Test completed with error -- document mismatch.");
                                break;
                            }
                        }
                        if(i == db1Docs.length) {
                            $('#finish_output').html("Test completed successfully.");
                        }
                    } else {
                        $('#finish_output').html("Test completed with error -- unequal number of documents between db1 and db4.");
                    }
                }
            });
        }
    });
}

function get(url) {
    // Return a new promise.
    return new Promise(function(resolve, reject) {
        // Do the usual XHR stuff
        var req = new XMLHttpRequest();
        req.open('GET', url);

        req.onload = function() {
            // This is called even on 404 etc
            // so check the status
            if (req.status == 200) {
                // Resolve the promise with the response text
                resolve(req.response);
            }
            else {
                // Otherwise reject with the status text
                // which will hopefully be a meaningful error
                reject(Error(req.statusText));
            }
        };

        // Handle network errors
        req.onerror = function() {
            reject(Error("Network Error"));
        };

        // Make the request
        req.send();
    });
}

var state = "none";
$(function() {
    $("#start_test").click(function() {
        var getHttpKeyUrl = TDHReplication.relayAddress + "/_relayutility/localhttpkeys";
        state = "get http key";
        get(getHttpKeyUrl).then(function (response) {
            var data = JSON.parse(response);
            localHttpKeyUrl = data['localMachineIPHttpKeyURL'];
            publicHttpKeyUrl = data['onionHttpKeyURL'];
            state = "got http key";
        }).then(function () {
            state = "clear db1";
            return PouchDB.destroy(dbOne);
        }).then(function () {
            state = "clear db2";
            return PouchDB.destroy(dbTwoCouch);
        }).then(function () {
            state = "clear db3";
            return PouchDB.destroy(dbThreeCouch);
        }).then(function () {
            state = "clear db4";
            return PouchDB.destroy(dbFourCouch);
        }).then(function() {
            // Clean up the TDH
            TDHReplication.removeTdhReplicationRequest(dbThree, publicHttpKeyUrl + dbFour);
        }).then(function () {
            state = "add docs to db1";
            var docBag = generateDocs(100);
            var db1 = new PouchDB(dbOne);
            return db1.bulkDocs({docs: docBag});
        }).then(function () {
            state = "add db1 -> db2 pouch replication";
            PouchDBSync.addReplicationRequest(dbOne, dbTwoCouch, 3, -1, false);
        }).then(function () {
            state = "add db2 -> db3 pouch tdh replication";
            PouchDBSync.addReplicationRequest(dbTwo, localHttpKeyUrl + dbThree, 5, -1, true);
        }).then(function () {
            state = "add db3 -> db4 replication manager";
            TDHReplication.addTdhReplicationRequest(dbThree, publicHttpKeyUrl + dbFour);
        }).then(function () {
            state = "set timers";
            moreDocTimer = setTimeout(addMoreDocs, moreDocTimerTimeout * 1000);
            checkDocCountTimer = setTimeout(checkDocCount, checkDocTimerDuration * 1000);
            state = "done";
        }).then(function () {
            $("#test_setup_output").html("Test setup succeeded");
        }).catch(function(error) {
            $("#test_setup_output").html("Test setup failed at state: " + state + ", error: " + e);
        });
    });
});

})(typeof exports === 'undefined' ? this : exports);