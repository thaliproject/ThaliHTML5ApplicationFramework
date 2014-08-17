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

exports.PouchDBSync = {};
exports = exports.PouchDBSync;

// enable extra debug logging?
var enableDebugLogging = true;

// what is the relay address?
var relayAddress = "http://localhost:58000";

/**
 * This is a very fragile temporary function to let the address book grab a httpKey and shove it into
 * the key database.
 * @param httpKey
 */
var addHttpKeyToPermissionDatabase = function(httpKey) {
    var rsakeytype = "rsapublickey";
    var keyDatabaseName = "thaliprincipaldatabase";
    /*
     new PouchDB(request.from);
     Take HTTPKEYURL from foreign point, parse it to get out the public key parts and then put those into the

     keydatabase

     The document in keybase has four fields
     id - Exactly the value out of the httpkeyurl
     keyType - "RSAKeyType"
     modulus -
     exponent -

     Parsing HTTPKEYURL - httpkey://domain/publickey/stuff
     So do a split on "/" and we know the public key starts at 3 (check in JS obviously)
     The publickey will be of the form: "rsapublickey:" + Exponent + "." + modulus
     Then do a starts with rsapublickey: check and then substring to remove it
     Then split on "." and you are good to go!

     Will return a JSON object of the form
     { id: x,
     requestBody: y }

     Using Pouch we want to avoid a conflict so we will first do a get to get the current revision
     So easiest is just to do a get, grab the rev if any and then use it on the put.

     */
    var rsaPublicKeyString = httpKey.split("/")[3];
    // We don't do a -1 on rsakeytype.length because we want to eat the ":" separator
    var rsaPublicKeySplit = rsaPublicKeyString.substr(rsakeytype.length).split(".");
    var publicKeyDoc = {};
    publicKeyDoc.keyType = rsakeytype;
    publicKeyDoc.exponent = rsaPublicKeySplit[0];
    publicKeyDoc.modulus = rsaPublicKeySplit[1];
    // Yes, we use the same string as the record ID
    var recordId = rsaPublicKeyString;

    var keyDatabasePouch = new PouchDB(relayAddress + "/" + keyDatabaseName);
    keyDatabasePouch.get(recordId).then(
        function(doc) {
            return Promise.resolve();
        },
        function(err) {
            keyDatabasePouch.put(publicKeyDoc, recordId).then(
                function(response) {
                    return Promise.resolve();
                }, function(err) {
                    return Promise.reject(err);
                }
            );
        });
};

exports.addHttpKeyToPermissionDatabase = addHttpKeyToPermissionDatabase;

/**
 * Replication request:
 *  from - src of replication
 *  to - destination of replication
 *  frequency - period in seconds in which syncs are run
 *  count - total number of times to sync (< 0 indicates indefinitely)
 *  nextUpdate - what is the schedule for the next update (timestamp)
 *  tdhToTdh - is this a call that will be handled by the Proxy?
 *
 * Key for request based off of hash of "from" and "to" concatenated
 * and lower case.
 */
var replicationRequests = {};

/* create a replication request object and compute the key. */
function replicationRequest(from, to, frequency, count, tdhToTdh) {
    var request = {
        from: from,
        to: to,
        frequency: frequency,
        count: count,
        tdhToTdh: tdhToTdh
    };
    var key = md5(from.trim().toLowerCase() +
        "::" +
        to.trim().toLowerCase());
    request["key"] = key;

    return request;
}

/**
 * Schedule a replication request between two points at a particular frequency and for
 * a number of times (or until eternity if count <= 0)
 * @param from  src of replication
 * @param to    destination of replication
 * @param frequency     period in seconds to perform the replication
 * @param count         number of times to sync (if <= 0, indicates indefinitely)
 * @param tdhToTdh    Do we replicate between two TDHs instead of Pouch to TDH
 */
function addReplicationRequest(from, to, frequency, count, tdhToTdh) {
    if(tdhToTdh === undefined) {
        tdhToTdh = false;
    }

    if (count <= 0) {
        count = -1;
    }
    var request = replicationRequest(from, to, frequency, count, tdhToTdh);
    var key = request.key;

    if ((key in replicationRequests) && (replicationRequests.hasOwnProperty(key))) {
        unscheduleReplicationRequest(request);
    }

    replicationRequests[key] = request;
    scheduleReplicationRequest(request, true);

    if (enableDebugLogging) {
        console.log("Requested sync: " + JSON.stringify(request));
    }
}
exports.addReplicationRequest = addReplicationRequest;

/**
 * Toggle extra logging.
 * @param doit
 */
function enableLogging(doit) {
    if(doit === undefined || doit === null) {
        doit = false;
    }
    enableDebugLogging = doit;
}
exports.enableLogging = enableLogging;

    /**
     * Set location of relay.
     * @param address
     */
function setRelayAddress(address) {
    if(relayAddress !== undefined && relayAddress != null) {
        relayAddress = address;
    }
}
exports.setRelayAddress = setRelayAddress;

/**
 * Remove a replication request from the queue based on the source and destination
 * of the replication request.
 *
 * @param from  the database to replicate from
 * @param to    the database to replicate to
 */
function removeReplicationRequest(from, to) {
    var request = replicationRequest(from, to, 0, 0);
    unscheduleReplicationRequest(request);
}
exports.removeReplicationRequest = removeReplicationRequest;


/**
 * Timer details:
 *  startTime - clock time the timer was started
 *  duration - duration the timer was set for (in seconds)
 *  timerHandle - handle to the current timer
 */
var currentTimer = null;
var timerQueue = [];

function processReplicationRequest(request) {
    console.log(request.from + " --> " + request.to);
}

/**
 * Given a timestamp, determine which of the scheduled replication tasks need to be
 * performed.  Return the keys to those requests in an array.
 * @param now           time period for when requests are to be replicated
 * @returns {Array}     request keys to replicate
 */
function requestsThatNeedProcessing(now) {
    var requests = [];
    var timeIdx, timeSlots = 0;

    // iterate over the timer queue and figure out which requests need to be replicated
    if(timerQueue != null && timerQueue.length > 0) {
        for(timeIdx in timerQueue) {
            if (timerQueue.hasOwnProperty(timeIdx)) {
                if (timeIdx <= now) {
                    timeSlots++;
                    if ((timerQueue[timeIdx] !== undefined) && (timerQueue[timeIdx] != null)) {
                        for (var requestIdx in timerQueue[timeIdx]) {
                            if(timerQueue[timeIdx].hasOwnProperty(requestIdx)) {
                                var requestKey = timerQueue[timeIdx][requestIdx];
                                if ((replicationRequests != null) && (replicationRequests[requestKey] !== undefined)) {
                                    requests[requests.length] = requestKey;
                                }
                            }
                        }
                    }
                    delete timerQueue[timeIdx];
                } else {
                    break;
                }
            }
        }
    }

    return requests;
}

function getEmptyPromise() {
    return new Promise(function(resolve, reject) {
        resolve();
    });
}

function scheduleNextReplication(request) {
    var result = -1;
    if ((request.count < 0) || (--request.count > 0)) {
        // schedule the replication requests next iteration
        scheduleReplicationRequest(request, false);
        result = request.frequency;
    } else {
        // we are done with the request, we can delete it
        if(enableDebugLogging) {
            console.log("Replication complete for: " + JSON.stringify(request));
        }
        delete replicationRequests[requestKey];
    }
    return result;
}

/**
 * Creates the promise that performs the actual replication request for a particular key.
 * @param requestKey
 */
function processPouchToTDHReplicationRequestPromise(requestKey) {
    var promise;
    var request = ((requestKey in replicationRequests) ? replicationRequests[requestKey] : null);
    if(request == null) {
        promise = getEmptyPromise();
    } else {
        promise = PouchDB.replicate(request.from, request.to, { create_target: true, server: false }).then(function() {
            return scheduleNextReplication(request);
        }, function(err) {
            console.log("Error occurred during replication: " + err + " -- for request: " + JSON.string(request));
            return scheduleNextReplication(request);
        });
    }
    return promise;
}

function processTdhToTdhReplicationRequestPromise(requestKey) {
    var promise;
    var request = ((requestKey in replicationRequests) ? replicationRequests[requestKey] : null);
    if(request == null) {
        promise = getEmptyPromise();
    } else {
        promise = new Promise(function (resolve, reject) {
            var url = relayAddress + "/_replicate";
            var body = {
                'source': request.from,
                'target': request.to,
                'create_target': true
            };

            var req = new XMLHttpRequest();
            req.open('POST', url);
            req.setRequestHeader("Content-Type", "application/json");
            req.setRequestHeader("Accept", "application/json, text/plain");
            req.onload = function() {
                // check the status
                if(req.status != 200) {
                    console.log("Request failed.  Status: " + req.status + ", Replication request: " + request.from + " --> " + request.to);
                }
                resolve(scheduleNextReplication(request));
            };
            req.onerror = function() {
                console.log("There was a network area.  Replication request: " + request.from + " --> " + request.to);
                resolve(scheduleNextReplication(request));
            };
            req.send(JSON.stringify(body));
        });
    }
    return promise;
}

/**
 * Given the updates performed and pending requests, determine when the next time
 * to trigger a timer to perform replication requests is.  If there are no new
 * or pending replications needed, the timer is not set up again.
 * @param now   time at which the current timer triggered
 * @param updateTimes   an array of the number of seconds needed by serviced updates
 */
function figureNextUpdate(now, updateTimes) {
    if(typeof updateTimes === "number") {
        updateTimes = [updateTimes];
    }

    // if there are quests pending in the timer queue, determine how many seconds from now that is
    var nextTimerTrigger = (function() { for(var i in timerQueue) { return i; } })();
    if(nextTimerTrigger !== undefined) {
        nextTimerTrigger -= now;
    }

    // for the requests completed, determine if any need to be rescueduled, and the earliest time required
    var nextRequestUpdateTime;
    updateTimes.forEach(function(updateTime) {
        if(updateTime > 0) {
            if((nextRequestUpdateTime === undefined) || (updateTime < nextRequestUpdateTime)) {
                nextRequestUpdateTime = updateTime;
            }
        }
    });

    // figure out the next time the timer needs to trigger
    if((nextTimerTrigger === undefined) && (nextRequestUpdateTime === undefined)) {
        // the queue is empty
        if(replicationRequests.length > 0) {
            console.log("Somehow we have extra requests");
        }
        nextTimerTrigger = 0; // don't fire a new timer
    } else {
        if(nextTimerTrigger === undefined) {
            nextTimerTrigger = nextRequestUpdateTime;
        } else if(nextRequestUpdateTime !== undefined) {
            if(nextRequestUpdateTime < nextTimerTrigger) {
                nextTimerTrigger = nextRequestUpdateTime;
            }
        }
        if(nextTimerTrigger <= 0) {
            nextTimerTrigger = 1;
        }
    }

    // if we are firing a timer, compare against the current time.  if we are
    // past due, shorten the trigger time.
    if(nextTimerTrigger > 0) {
        if (now + nextTimerTrigger < Math.floor(Date.now() / 1000)) {
            nextTimerTrigger = 1;
        }
        setTimeout(timerHandler, nextTimerTrigger * 1000);
    }
}

function determineProperPromise(requestKey) {
    var promise = null;
    if(requestKey in replicationRequests) {
        var request = replicationRequests[requestKey];
        if(request.tdhToTdh) {
            promise = processTdhToTdhReplicationRequestPromise;
        } else {
            promise = processPouchToTDHReplicationRequestPromise;
        }
    }
    return promise;
}

/**
 * Timer handler that determines the replication requests to perform and does so.
 */
function timerHandler() {
    var now = Math.floor(Date.now() / 1000);
    var promise;

    // determine requests to process
    var requestsToProcess = requestsThatNeedProcessing(now);

    // determine if we have a single or multiple requests to process
    if(requestsToProcess.length == 1) {
        promise = determineProperPromise(requestsToProcess[0]);
        if(promise != null) {
            promise(requestsToProcess[0]).then(function (updateTime) {
                figureNextUpdate(now, updateTime);
            }, function (err) {
                console.log("Processing of single request failed: " + err)
            });
        } else {
            figureNextUpdate(now, -1);
        }
    } else {
        // process requests
        var requestPromises = [];
        for(var idx in requestsToProcess) {
            promise = determineProperPromise(requestsToProcess[idx]);
            if(promise != null) {
                requestPromises.push(promise(requestsToProcess[idx]));
            }
        }
        if(requestPromises.length > 0) {
            Promise.all(requestPromises).then(function (updateTimes) {
                figureNextUpdate(now, updateTimes);
            }, function (err) {
                console.log("Processing of multiple requests failed: " + err)
            });
        } else {
            figureNextUpdate(now, -1);
        }
    }
}

/**
 * A timer is required.  If the timer is currently running, determine if it needs
 * to be reset to trigger sooner based upon the new request.
 * @param now
 * @param requestTime
 */
function updateTimerAsNeeded(now, requestTime) {
    if(currentTimer != null) {
        if(currentTimer.startTime + currentTimer.duration < requestTime) {
            return;
        } else {
            clearTimeout(currentTimer.timerHandle);
        }
        currentTimer = null;
    }
    var timeoutDuration = ((requestTime < now) ? 1 : (requestTime - now));
    currentTimer = {
        startTime: now,
        duration: timeoutDuration,
        timerHandle: setTimeout(timerHandler, timeoutDuration * 1000)
    };
}

/**
 * Given a request, figure out when it needs to be scheduled.  If necessary, update
 * the timer as well.  Note, while requests are being processed in a timer, we do
 * not reset the timer since it will be updated at the end of the timer handler.
 * @param request       the request to schedule
 * @param updateTimer   do we need to update the timer?
 */
var scheduleReplicationRequest = function(request, updateTimer) {
    var now = Math.floor(Date.now() / 1000);
    var requestTime = now + request.frequency;
    request.nextUpdate = requestTime;
    if(timerQueue[requestTime] === undefined) {
        timerQueue[requestTime] = [request.key];
    } else {
        timerQueue[requestTime][timerQueue[requestTime].length] = request.key;
    }
    if(updateTimer) {
        updateTimerAsNeeded(now, requestTime);
    }
}

/**
 * Remove a replication request from the active set of requests being processed.
 * Rather than attempt to remove it from the timer as well, we just check for it's
 * presence when the timer triggers.  Note, for the case where we remove then add
 * a comparable replication request (same key), we check the nextUpdate in the
 * request object to make sure it is not fired prematurely.
 * @param request
 */
function unscheduleReplicationRequest(request) {
    if(request.key in replicationRequests) {
        delete replicationRequests[request.key];
    }
}

})(typeof exports === 'undefined' ? this : exports);

