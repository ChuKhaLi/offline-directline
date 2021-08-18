interface WebSocket {
    close(): void;
    send(data: any, cb?: (err?: Error) => void): void;
}
export declare class WebSocketServer {
    private static restServer;
    private static servers;
    private static trafficServer;
    private static sockets;
    private static queuedMessages;
    private static sendBackedUpMessages;
    static port: number;
    static getSocketByConversationId(conversationId: string): WebSocket;
    static queueActivities(conversationId: string, activity: any): void;
    static sendToSubscribers(conversationId: string, activity: any): void;
    static init(): Promise<number>;
    static sendTrafficToSubscribers(data: any): void;
    static cleanUpConversation(conversationId: string): void;
    static cleanUpAll(): void;
    static cleanUpAllConversations(): void;
}
export {};
