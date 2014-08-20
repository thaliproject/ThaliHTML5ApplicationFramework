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
var localCouchInstance = TDHReplication.relayAddress;
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

var dbOne = testDb1Name;
var dbTwo = localCouchInstance + "/" + testDb1Name;
var dbThree = testDb2Name;
var dbFour = localCouchInstance + "/" + testDb2Name;
var moreDocTimer;
var testDuration = 120; // seconds

function addMoreDocs() {
    var docBag = generateDocs(random(1,100));
    var db = new PouchDB(dbOne);
    db.bulkDocs({docs: docBag}).then(function() {
        console.log("added: " + docBag.length);
    }).then(function() {
        var db2 = PouchDB(dbThree);
        return db.bulkDocs({docs: docBag});
    }).then(function() {
        moreDocTimer = setTimeout(addMoreDocs, 4000);
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

$(function() {
    var docBag = generateDocs(100);

    var getHttpKeyUrl = TDHReplication.relayAddress+"/_relayutility/localhttpkeys";
    var httpKeyUrl;
    get(getHttpKeyUrl).then(function(response) {
        var data = JSON.parse(response);
        httpKeyUrl = data['localMachineIPHttpKeyURL'];
    }).then(function() {
        return PouchDB.destroy(dbOne);
    }).then(function() {
        var db1 = new PouchDB(dbOne);
        return db1.bulkDocs({docs: docBag});
    }).then(function() {
        try {
            PouchDBSync.addReplicationRequest(dbOne, httpKeyUrl+dbThree, 5, 12, true);
            moreDocTimer = setTimeout(addMoreDocs, 4000);

            // set up timer to end test
            setTimeout(function() {
                console.log("ending test");
                PouchDBSync.removeReplicationRequest(dbOne, httpKeyUrl+dbThree);
                clearTimeout(moreDocTimer);
            }, testDuration * 1000);
        } catch(err) {
            console.log(err);
        }
    });
});

