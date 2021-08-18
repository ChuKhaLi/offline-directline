"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const http = require("http");
const portfinder_1 = require("portfinder");
const ws_1 = require("ws");
const express = require("express");
const socketTrafficChannelKey = 'DL_TRAFFIC_SOCKET';
class WebSocketServer {
    static sendBackedUpMessages(conversationId, socket) {
        if (this.queuedMessages[conversationId]) {
            while (this.queuedMessages[conversationId].length > 0) {
                const activity = this.queuedMessages[conversationId].shift();
                if (activity) {
                    const payload = { activities: [activity] };
                    socket.send(JSON.stringify(payload));
                    this.sendTrafficToSubscribers(Object.assign(Object.assign({}, payload), { trafficType: 'activity' }));
                }
            }
        }
    }
    static getSocketByConversationId(conversationId) {
        return this.sockets[conversationId];
    }
    static queueActivities(conversationId, activity) {
        if (!this.queuedMessages[conversationId]) {
            this.queuedMessages[conversationId] = [];
        }
        this.queuedMessages[conversationId].push(activity);
    }
    static sendToSubscribers(conversationId, activity) {
        const socket = this.sockets[conversationId];
        if (socket) {
            const payload = { activities: [activity] };
            this.sendBackedUpMessages(conversationId, socket);
            socket.send(JSON.stringify(payload));
            this.sendTrafficToSubscribers(Object.assign(Object.assign({}, payload), { trafficType: 'activity' }));
        }
        else {
            this.queueActivities(conversationId, activity);
        }
    }
    static init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.restServer) {
                return this.port;
            }
            const app = express();
            this.restServer = http.createServer(app);
            this.restServer.on('upgrade', (req, socket, head) => {
                req.claimUpgrade = () => ({
                    head,
                    socket,
                });
                const res = new http.ServerResponse(req);
                return app(req, res);
            });
            const port = yield portfinder_1.getPortPromise();
            this.port = port;
            this.restServer.listen(port);
            app.use('/ws/conversation/:conversationId', (req, res) => {
                if (!req.claimUpgrade) {
                    return res
                        .status(426)
                        .send('Connection must upgrade for web sockets.');
                }
                const conversationId = req.params.conversationId;
                // initialize a new web socket server for each new conversation
                if (conversationId && !this.servers[conversationId]) {
                    const { head, socket } = req.claimUpgrade();
                    const wsServer = new ws_1.Server({
                        noServer: true
                    });
                    wsServer.on('connection', (socket, req) => {
                        this.sendBackedUpMessages(conversationId, socket);
                        this.sockets[conversationId] = socket;
                        socket.on('close', () => {
                            delete this.servers[conversationId];
                            delete this.sockets[conversationId];
                            delete this.queuedMessages[conversationId];
                        });
                    });
                    // upgrade the connection to a ws connection
                    wsServer.handleUpgrade(req, socket, head, (socket) => {
                        wsServer.emit('connection', socket, req);
                    });
                    this.servers[conversationId] = wsServer;
                }
            });
            app.use('/ws/traffic', (req, res) => {
                if (!req.claimUpgrade) {
                    return res
                        .status(426)
                        .send('Connection must upgrade for web sockets.');
                }
                if (!this.trafficServer) {
                    const { head, socket } = req.claimUpgrade();
                    const wsServer = new ws_1.Server({
                        noServer: true
                    });
                    wsServer.on('connection', (socket, req) => {
                        this.sockets[socketTrafficChannelKey] = socket;
                        socket.on('close', () => {
                            this.trafficServer = null;
                            delete this.sockets[socketTrafficChannelKey];
                        });
                    });
                    wsServer.handleUpgrade(req, socket, head, (socket) => {
                        wsServer.emit('connection', socket, req);
                    });
                    this.trafficServer = wsServer;
                }
            });
            return this.port;
        });
    }
    static sendTrafficToSubscribers(data) {
        var _a;
        (_a = this.sockets[socketTrafficChannelKey]) === null || _a === void 0 ? void 0 : _a.send(JSON.stringify(data));
    }
    static cleanUpConversation(conversationId) {
        var _a, _b;
        if (this.sockets[conversationId]) {
            (_a = this.sockets[conversationId]) === null || _a === void 0 ? void 0 : _a.close();
        }
        if (this.servers[conversationId]) {
            (_b = this.servers[conversationId]) === null || _b === void 0 ? void 0 : _b.close();
        }
    }
    static cleanUpAll() {
        this.cleanUpAllConversations();
        if (this.trafficServer) {
            this.trafficServer.close();
        }
        if (this.restServer) {
            this.restServer.close();
        }
    }
    static cleanUpAllConversations() {
        for (const conversationId in this.sockets) {
            this.cleanUpConversation(conversationId);
        }
    }
}
exports.WebSocketServer = WebSocketServer;
WebSocketServer.servers = {};
WebSocketServer.trafficServer = null;
WebSocketServer.sockets = {};
WebSocketServer.queuedMessages = {};
//# sourceMappingURL=webSocketServer.js.map