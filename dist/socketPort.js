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
exports.cleanUpConversation = exports.getWebSocketPort = void 0;
const http_status_codes_1 = require("http-status-codes");
const webSocketServer_1 = require("./webSocketServer");
function getWebSocketPort(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let socketPort = webSocketServer_1.WebSocketServer.port;
            let newRestServerSetup = false;
            if (!socketPort) {
                socketPort = yield webSocketServer_1.WebSocketServer.init();
                newRestServerSetup = true;
            }
            res.status(http_status_codes_1.default.OK).json({
                port: socketPort,
                newRestServerSetup
            });
        }
        catch (e) {
            res.status(http_status_codes_1.default.INTERNAL_SERVER_ERROR).json(e);
        }
    });
}
exports.getWebSocketPort = getWebSocketPort;
function cleanUpConversation(conversationId) {
    webSocketServer_1.WebSocketServer.cleanUpConversation(conversationId);
}
exports.cleanUpConversation = cleanUpConversation;
//# sourceMappingURL=socketPort.js.map