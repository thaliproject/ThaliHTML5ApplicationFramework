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

/**
 * Replication request:
 *  from - src of replication
 *  to - destination of replication
 *  frequency - period in seconds in which syncs are run
 *  count - total number of times to sync (< 0 indicates indefinitely)
 *  nextUpdate - what is the schedule for the next update (timestamp)
 *
 * Key for request based off of hash of "from" and "to" concatenated
 * and lower case.
 */
var replicationRequests = {};

/* create a replication request object and compute the key. */
function replicationRequest(from, to, frequency, count) {
    var request = {
        from: from,
        to: to,
        frequency: frequency,
        count: count
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
 */
function addReplicationRequest(from, to, frequency, count) {
    if (count <= 0) {
        count = -1;
    }
    var request = replicationRequest(from, to, frequency, count);
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
            if(timeIdx <= now) {
                timeSlots++;
                if ((timerQueue[timeIdx] !== undefined) && (timerQueue[timeIdx] != null)) {
                    for(var requestIdx in timerQueue[timeIdx]) {
                        var requestKey = timerQueue[timeIdx][requestIdx];
                        if((replicationRequests != null) && (replicationRequests[requestKey] !== undefined)) {
                            requests[requests.length] = requestKey;
                        }
                    }
                }
                delete timerQueue[timeIdx];
            } else {
                break;
            }
        }
    }

    return requests;
}

/**
 * Creates the promise that performs the actual replication request for a particular key.
 * @param requestKey
 */
function processReplicationRequestPromise(requestKey) {
    function scheduleNextReplication() {
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

    var request = ((requestKey in replicationRequests) ? replicationRequests[requestKey] : null);
    if(request == null) {
        return new Promise(function (resolve, reject) {
            resolve();
        });
    } else {
        var fromDb, toDb;
        fromDb = new PouchDB(request.from);
        toDb = new PouchDB(request.to);
        return fromDb.replicate.to(toDb, { create_target: true, server: false }).then(function() {
            return scheduleNextReplication();
        }, function(err) {
            console.log("Error occured during replication: " + err + " -- for request: " + JSON.string(request));
            return scheduleNextReplication();
        });
    }
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

/**
 * Timer handler that determines the replication requests to perform and does so.
 */
function timerHandler() {
    var now = Math.floor(Date.now() / 1000);

    // determine requests to process
    var requestsToProcess = requestsThatNeedProcessing(now);

    //
    if(requestsToProcess.length == 1) {
        processReplicationRequestPromise(requestsToProcess[0]).then(function(updateTime) {
            figureNextUpdate(now, updateTime);
        }, function(err) {
            console.log("Processing of single request failed: " + err)
        });
    } else {
        // process requests
        var requestPromises = [];
        for(var idx in requestsToProcess) {
            requestPromises.push(processReplicationRequestPromise(requestsToProcess[idx]));
        }

        Promise.all(requestPromises).then(function(updateTimes) {
            figureNextUpdate(now, updateTimes);
        }, function(err) {
            console.log("Processing of multiple requests failed: " + err)
        });
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
    if(request.key in replicationRequest) {
        delete replicationRequest[request.key];
    }
}

})(typeof exports === 'undefined' ? this : exports);

