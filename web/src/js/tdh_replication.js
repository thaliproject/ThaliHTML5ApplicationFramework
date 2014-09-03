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

exports.TDHReplication = {};
exports = exports.TDHReplication;

// enable extra debug logging?
var enableDebugLogging = true;

// what is the relay address?
// This goes away with https://github.com/thaliproject/ThaliHTML5ApplicationFramework/issues/4
var relayAddress = "http://localhost:58000";
exports.relayAddress = relayAddress;

function processTdhReplicationRequestPromise(source, target, isCancel) {
    if(isCancel === undefined) {
        isCancel = false;
    }

    return new Promise(function (resolve, reject) {
        var url = exports.relayAddress + "/_replicate";
        var body = {
            'source': source,
            'target': target,
            'create_target': true,
            'managed_replication': true,
            'cancel': isCancel
        };

        var req = new XMLHttpRequest();
        req.open('POST', url);
        req.setRequestHeader("Content-Type", "application/json");
        req.setRequestHeader("Accept", "application/json, text/plain");
        req.onload = function() {
            // check the status
            if(req.status != 200) {
                console.log("Request failed.  Status: " + req.status + ", Replication request: " + source + " --> " + target);
                reject(req);
            } else {
                resolve();
            }
        };
        req.onerror = function() {
            console.log("There was a network error.  Replication request: " + source + " --> " + target);
            reject(req);
        };
        req.send(JSON.stringify(body));
    });
}

function addTdhReplicationRequest(from, to) {
    return processTdhReplicationRequestPromise(from, to, false);
}
exports.addTdhReplicationRequest = addTdhReplicationRequest;

function removeTdhReplicationRequest(from, to) {
    return processTdhReplicationRequestPromise(from, to, true);
}
exports.removeTdhReplicationRequest = removeTdhReplicationRequest;

function getHttpKeys() {
    return new Promise(function (resolve, reject) {
        var req = new XMLHttpRequest();
        req.open('GET', exports.relayAddress + "/_relayutility/localhttpkeys");
        req.onload = function() {
            if (req.status != 200) {
                console.log("HTTPKEY request failed. Status: " + req.status);
                reject(req);
            } else {
                var httpKeys = JSON.parse(req.responseText);
                resolve(httpKeys);
            }
        };
        req.onerror = function() {
            console.log("There was a network error in trying to get httpkeys");
            reject(req);
        };
        req.send();
    });
}

/**
 * In Java we start the relay before the web browser is loaded but in Android the web browser starts before
 * the relay is started. When we switch to using the XWalk web view this problem will largely go away but
 * until then we need a way to tell if the relay and TDH are started. Otherwise all of our requests will fail.
 * @returns {Promise}
 */
function waitForRelayToStart() {
    return new Promise(function (resolve, reject) {
        waitForRelayToStartRecursive(resolve, reject);
    })
}
exports.waitForRelayToStart = waitForRelayToStart;

function waitForRelayToStartRecursive(resolve, reject) {
    setTimeout(function () {
        getHttpKeys()
            .then(function() {
                resolve();
            })
            .catch(function() {
                waitForRelayToStartRecursive(resolve, reject);
            });
    }, 100);
}

/**
 * Turns the groupName and databasePath into a group URL using the TDH's public key for scoping
 * @param groupName For now 'all' is pretty much the only legal value
 * @param databasePath Keep it simple, just put in the couchbase database name, don't start with a '/'
 * @returns {Promise}
 */
function createLocalGroupURL(groupName, databasePath) {
    return getHttpKeys()
        .then(function(httpKeys) {
            var serverPublicKey = httpKeys['localMachineIPHttpKeyURL'].split("/")[3];
            var groupUrl = "thaligroup:/"+ serverPublicKey + "/" + groupName + "/httpkeysimple/" + databasePath;
            return groupUrl;
        });
}
exports.createLocalGroupURL = createLocalGroupURL;

function createLocalTDHHttpKeyURL(databaseName) {
    return getHttpKeys()
        .then(function(httpKeys) {
            // var httpKeyURL = httpKeys['localMachineIPHttpKeyURL'] + databaseName;
            // TODO - This is a hack until we put in support for httpkey URLs in PouchDB
            return relayAddress + "/" + databaseName;
        });
}

exports.createLocalTDHHttpKeyURL = createLocalTDHHttpKeyURL;

})(typeof exports === 'undefined' ? this : exports);