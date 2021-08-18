// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as http from 'http'

import { getPortPromise } from 'portfinder'
import { Response } from 'express'
import { Server as WSServer } from 'ws'
import express = require('express')

const socketTrafficChannelKey = 'DL_TRAFFIC_SOCKET'
interface WebSocket {
    close(): void
    send(data: any, cb?: (err?: Error) => void): void
}

export class WebSocketServer {
    private static restServer: http.Server
    private static servers: Record<string, WSServer> = {}
    private static trafficServer: WSServer | null = null
    private static sockets: Record<string, WebSocket> = {}

    private static queuedMessages: { [conversationId: string]: any[] } = {}

    private static sendBackedUpMessages(
        conversationId: string,
        socket: WebSocket
    ) {
        if (this.queuedMessages[conversationId]) {
            while (this.queuedMessages[conversationId].length > 0) {
                const activity =
                    this.queuedMessages[conversationId].shift()
                if (activity) {
                    const payload = { activities: [activity] }
                    socket.send(JSON.stringify(payload))
                    this.sendTrafficToSubscribers({
                        ...payload,
                        trafficType: 'activity'
                    })
                }
            }
        }
    }

    public static port: number

    public static getSocketByConversationId(conversationId: string): WebSocket {
        return this.sockets[conversationId]
    }

    public static queueActivities(
        conversationId: string,
        activity: any
    ): void {
        if (!this.queuedMessages[conversationId]) {
            this.queuedMessages[conversationId] = []
        }
        this.queuedMessages[conversationId].push(activity)
    }

    public static sendToSubscribers(
        conversationId: string,
        activity: any
    ): void {
        const socket = this.sockets[conversationId]
        if (socket) {
            const payload = { activities: [activity] }
            this.sendBackedUpMessages(conversationId, socket)
            socket.send(JSON.stringify(payload))
            this.sendTrafficToSubscribers({
                ...payload,
                trafficType: 'activity'
            })
        } else {
            this.queueActivities(conversationId, activity)
        }
    }

    public static async init() {
        if (this.restServer) {
            return this.port;
        }

        const app = express()
        this.restServer = http.createServer(app)

        this.restServer.on('upgrade', (req, socket, head) => {
            (req as any).claimUpgrade = () => ({
                head,
                socket,
            });
            const res = new http.ServerResponse(req);
            return app(req, res as Response);
        });

        const port = await getPortPromise()
        this.port = port
        this.restServer.listen(port)

        app.use(
            '/ws/conversation/:conversationId',
            (req: express.Request, res: express.Response) => {
                if (!(req as any).claimUpgrade) {
                    return res
                        .status(426)
                        .send('Connection must upgrade for web sockets.')
                }
                const conversationId = req.params.conversationId
                // initialize a new web socket server for each new conversation
                if (conversationId && !this.servers[conversationId]) {
                    const { head, socket } = (req as any).claimUpgrade()

                    const wsServer = new WSServer({
                        noServer: true
                    })

                    wsServer.on('connection', (socket, req) => {
                        this.sendBackedUpMessages(conversationId, socket)

                        this.sockets[conversationId] = socket
                        socket.on('close', () => {
                            delete this.servers[conversationId]
                            delete this.sockets[conversationId]
                            delete this.queuedMessages[conversationId]
                        })
                    })

                    // upgrade the connection to a ws connection
                    wsServer.handleUpgrade(
                        req as any,
                        socket,
                        head,
                        (socket) => {
                            wsServer.emit('connection', socket, req)
                        }
                    )
                    this.servers[conversationId] = wsServer
                }
            }
        )

        app.use(
            '/ws/traffic',
            (req: express.Request, res: express.Response) => {
                if (!(req as any).claimUpgrade) {
                    return res
                        .status(426)
                        .send('Connection must upgrade for web sockets.')
                }

                if (!this.trafficServer) {
                    const { head, socket } = (req as any).claimUpgrade()

                    const wsServer = new WSServer({
                        noServer: true
                    })

                    wsServer.on('connection', (socket, req) => {
                        this.sockets[socketTrafficChannelKey] = socket

                        socket.on('close', () => {
                            this.trafficServer = null
                            delete this.sockets[socketTrafficChannelKey]
                        })
                    })

                    wsServer.handleUpgrade(
                        req as any,
                        socket,
                        head,
                        (socket) => {
                            wsServer.emit('connection', socket, req)
                        }
                    )
                    this.trafficServer = wsServer
                }
            }
        )

        return this.port;
    }

    public static sendTrafficToSubscribers(
        data: any
    ): void {
        this.sockets[socketTrafficChannelKey]?.send(JSON.stringify(data))
    }

    public static cleanUpConversation(conversationId: string): void {
        if (this.sockets[conversationId]) {
            this.sockets[conversationId]?.close()
        }

        if (this.servers[conversationId]) {
            this.servers[conversationId]?.close()
        }
    }

    public static cleanUpAll(): void {
        this.cleanUpAllConversations();

        if (this.trafficServer) {
            this.trafficServer.close()
        }

        if (this.restServer) {
            this.restServer.close()
        }
    }

    public static cleanUpAllConversations(): void {
        for (const conversationId in this.sockets) {
            this.cleanUpConversation(conversationId)
        }
    }
}
