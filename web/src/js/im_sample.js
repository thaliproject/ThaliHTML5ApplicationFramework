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
var chatPouchName = "chat";
var chatGroupUrl;
var localTdhChatHttpKeyUrl;
var inputId = "im_message";
var messageWindowId = "im_display";
var wrapperId = "im_wrapper";

function postMessageToUx(message) {
    var p = document.createElement("P");
    var textNode = document.createTextNode(message);
    p.appendChild(textNode);
    document.getElementById(messageWindowId).appendChild(p);
}

var imPouch = new PouchDB(chatPouchName);
var chatChanges = imPouch.changes({ since: "now", live: true, include_docs: true}).on('create', function(resp) {
    postMessageToUx(resp.doc.message);
});

TDHReplication.waitForRelayToStart()
    .then(function() {
        return TDHReplication.createLocalTDHHttpKeyURL(chatPouchName); })
    .then(function(chatHttpKeyUrl) {
        localTdhChatHttpKeyUrl = chatHttpKeyUrl;
        PouchDBSync.addReplicationRequest(chatPouchName,  localTdhChatHttpKeyUrl, 1, -1, false); })
    .then(function() {
        PouchDBSync.addReplicationRequest(localTdhChatHttpKeyUrl, chatPouchName, 1, -1, false); })
    .then(function() {
        return TDHReplication.createLocalGroupURL("all", chatPouchName); })
    .then(function(groupUrl) {
        chatGroupUrl = groupUrl;
        TDHReplication.addTdhReplicationRequest(chatPouchName, chatGroupUrl); })
    .then(function() {
        TDHReplication.addTdhReplicationRequest(chatGroupUrl, chatPouchName); })
    .then(function() {
        document.getElementById(wrapperId).style.display = "inline";
        return imPouch.allDocs({include_docs: true});
    })
    .then(function(allDocsResponse) {
        var rows = allDocsResponse.rows;
        for(var rowIndex in rows) {
            postMessageToUx(rows[rowIndex].doc.message);
        }
    });

window.onbeforeunload = function() {
  TDHReplication.removeTdhReplicationRequest(chatPouchName, chatGroupUrl)
      .then(function() {
          TDHReplication.removeTdhReplicationRequest(chatGroupUrl, chatPouchName); })
      .catch(function(err) {
          console.log("Unload failed due to " + err);
      });
};

window.postIm = function() {
    var message = {};
    message.message = document.getElementById(inputId).value;
    imPouch.post(message);
};

window.deleteDatabaseContents = function(dbName) {
    var db = new PouchDB(TDHReplication.relayAddress + "/" + dbName);
    db.allDocs()
        .then(function(response) {
            var rows = response.rows;
            for(var rowIndex in rows) {
               db.remove(rows[rowIndex].id, rows[rowIndex].value.rev)
                   .catch(function(error) {
                       console.log("Delete failed due to: " + error);
                   })
            }
        })
        .catch(function(error) {
            console.log("Database alldocs request failed due to: " + error);
        })
};