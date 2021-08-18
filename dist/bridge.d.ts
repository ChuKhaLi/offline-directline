/// <reference types="express-serve-static-core" />
import * as express from 'express';
export declare const getRouter: (serviceUrl: string, botUrl: string, conversationInitRequired?: boolean, websocketPort?: number) => express.Router;
/**
 * @param app The express app where your offline-directline endpoint will live
 * @param port The port where your offline-directline will be hosted
 * @param botUrl The url of the bot (e.g. http://127.0.0.1:3978/api/messages)
 * @param conversationInitRequired Requires that a conversation is initialized before it is accessed, returning a 400
 * when not the case. If set to false, a new conversation reference is created on the fly. This is true by default.
 */
export declare const initializeRoutes: (app: express.Express, port: number, botUrl: string, conversationInitRequired?: boolean, websocketPort?: number) => void;
