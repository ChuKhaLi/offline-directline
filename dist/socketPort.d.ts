import * as express from 'express';
export declare function getWebSocketPort(req: express.Request, res: express.Response): Promise<void>;
export declare function cleanUpConversation(conversationId: string): void;
