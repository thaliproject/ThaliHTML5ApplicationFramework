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
var relayAddress = "http://localhost:58000";

function processTdhReplicationRequestPromise(source, target, isCancel) {
    if(isCancel === undefined) {
        isCancel = false;
    }

    var promise = new Promise(function (resolve, reject) {
        var url = relayAddress + "/_replicate";
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
            }
            resolve();
        };
        req.onerror = function() {
            console.log("There was a network area.  Replication request: " + source + " --> " + target);
            reject();
        };
        req.send(JSON.stringify(body));
    });
    return promise;
}

function addTdhReplicationRequest(from, to) {
    return processTdhReplicationRequestPromise(from, to, false);
}
exports.addTdhReplicationRequest = addTdhReplicationRequest;

function removeTdhReplicationRequest(from, to) {
    return processTdhReplicationRequestPromise(from, to, true);
}
exports.removeTdhReplicationRequest = removeTdhReplicationRequest;


})(typeof exports === 'undefined' ? this : exports);