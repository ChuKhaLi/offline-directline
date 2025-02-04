"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeRoutes = exports.getRouter = void 0;
const bodyParser = require("body-parser");
const express = require("express");
const fetch = require("isomorphic-fetch");
const moment = require("moment");
const uuidv4 = require("uuid/v4");
const socketPort_1 = require("./socketPort");
const webSocketServer_1 = require("./webSocketServer");
const expiresIn = 1800;
const conversationsCleanupInterval = 10000;
const conversations = {};
const botDataStore = {};
const getRouter = (serviceUrl, botUrl, conversationInitRequired = true, websocketPort = 0) => {
    const router = express.Router();
    router.use(bodyParser.json()); // for parsing application/json
    router.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
    router.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-ms-bot-agent');
        next();
    });
    // CLIENT ENDPOINT
    router.options('/directline', (req, res) => {
        res.status(200).end();
    });
    // Creates a conversation
    router.post('/directline/conversations', (req, res) => {
        const conversationId = uuidv4().toString();
        conversations[conversationId] = {
            conversationId,
            history: [],
        };
        console.log('Created conversation with conversationId: ' + conversationId);
        const activity = createConversationUpdateActivity(serviceUrl, conversationId);
        fetch(botUrl, {
            method: 'POST',
            body: JSON.stringify(activity),
            headers: {
                'Content-Type': 'application/json',
            },
        }).then((response) => {
            res.status(response.status).send({
                conversationId,
                expiresIn,
            });
        });
    });
    // Reconnect API
    router.get('/v3/directline/conversations/:conversationId', (req, res) => { console.warn('/v3/directline/conversations/:conversationId not implemented'); });
    // Gets activities from store (local history array for now)
    router.get('/directline/conversations/:conversationId/activities', (req, res) => {
        const watermark = req.query.watermark && req.query.watermark !== 'null' ? Number(req.query.watermark) : 0;
        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        if (conversation) {
            // If the bot has pushed anything into the history array
            if (conversation.history.length > watermark) {
                const activities = conversation.history.slice(watermark);
                res.status(200).json({
                    activities,
                    watermark: watermark + activities.length,
                    streamUrl: `ws://localhost:${websocketPort}/ws/conversation/${req.params.conversationId}`
                });
            }
            else {
                res.status(200).send({
                    activities: [],
                    watermark,
                });
            }
        }
        else {
            // Conversation was never initialized
            res.status(400).send();
        }
    });
    // Sends message to bot. Assumes message activities
    router.post('/directline/conversations/:conversationId/activities', (req, res) => {
        const incomingActivity = req.body;
        // Make copy of activity. Add required fields
        const activity = createMessageActivity(incomingActivity, serviceUrl, req.params.conversationId);
        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        if (!conversation) {
            // Conversation was never initialized
            res.status(400).send();
            return;
        }
        conversation.history.push(activity);
        fetch(botUrl, {
            method: 'POST',
            body: JSON.stringify(activity),
            headers: {
                'Content-Type': 'application/json',
            },
        }).then((response) => {
            res.status(response.status).json({ id: activity.id });
            webSocketServer_1.WebSocketServer.sendToSubscribers(conversation.conversationId, activity);
        });
    });
    router.post('/v3/directline/conversations/:conversationId/upload', (req, res) => { console.warn('/v3/directline/conversations/:conversationId/upload not implemented'); });
    router.get('/v3/directline/conversations/:conversationId/stream', (req, res) => { console.warn('/v3/directline/conversations/:conversationId/stream not implemented'); });
    // BOT CONVERSATION ENDPOINT
    router.post('/v3/conversations', (req, res) => { console.warn('/v3/conversations not implemented'); });
    router.post('/v3/conversations/:conversationId/activities', (req, res) => {
        let activity;
        activity = req.body;
        activity.id = uuidv4();
        activity.from = { id: 'id', name: 'Bot' };
        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        if (conversation) {
            conversation.history.push(activity);
            res.status(200).send();
        }
        else {
            // Conversation was never initialized
            res.status(400).send();
        }
    });
    router.post('/v3/conversations/:conversationId/activities/:activityId', (req, res) => {
        let activity;
        activity = req.body;
        activity.id = uuidv4();
        activity.from = { id: 'id', name: 'Bot' };
        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        if (conversation) {
            conversation.history.push(activity);
            res.status(200).send();
        }
        else {
            // Conversation was never initialized
            res.status(400).send();
        }
    });
    router.get('/v3/conversations/:conversationId/members', (req, res) => { console.warn('/v3/conversations/:conversationId/members not implemented'); });
    router.get('/v3/conversations/:conversationId/activities/:activityId/members', (req, res) => { console.warn('/v3/conversations/:conversationId/activities/:activityId/members'); });
    // BOTSTATE ENDPOINT
    router.get('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log('Called GET user data');
        getBotData(req, res);
    });
    router.get('/v3/botstate/:channelId/conversations/:conversationId', (req, res) => {
        console.log(('Called GET conversation data'));
        getBotData(req, res);
    });
    router.get('/v3/botstate/:channelId/conversations/:conversationId/users/:userId', (req, res) => {
        console.log('Called GET private conversation data');
        getBotData(req, res);
    });
    router.post('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log('Called POST setUserData');
        setUserData(req, res);
    });
    router.post('/v3/botstate/:channelId/conversations/:conversationId', (req, res) => {
        console.log('Called POST setConversationData');
        setConversationData(req, res);
    });
    router.post('/v3/botstate/:channelId/conversations/:conversationId/users/:userId', (req, res) => {
        setPrivateConversationData(req, res);
    });
    router.delete('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log('Called DELETE deleteStateForUser');
        deleteStateForUser(req, res);
    });
    router.get('/directline/conversations/ws/port', socketPort_1.getWebSocketPort);
    router.get('/conversations/ws/port', socketPort_1.getWebSocketPort);
    return router;
};
exports.getRouter = getRouter;
/**
 * @param app The express app where your offline-directline endpoint will live
 * @param port The port where your offline-directline will be hosted
 * @param botUrl The url of the bot (e.g. http://127.0.0.1:3978/api/messages)
 * @param conversationInitRequired Requires that a conversation is initialized before it is accessed, returning a 400
 * when not the case. If set to false, a new conversation reference is created on the fly. This is true by default.
 */
const initializeRoutes = (app, port = 3000, botUrl, conversationInitRequired = true, websocketPort = 0) => {
    conversationsCleanup();
    const directLineEndpoint = `http://127.0.0.1:${port}`;
    const router = exports.getRouter(directLineEndpoint, botUrl, conversationInitRequired, websocketPort);
    app.use(router);
    app.listen(port, () => {
        console.log(`Listening for messages from client on ${directLineEndpoint}`);
        console.log(`Routing messages to bot on ${botUrl}`);
    });
};
exports.initializeRoutes = initializeRoutes;
const getConversation = (conversationId, conversationInitRequired) => {
    // Create conversation on the fly when needed and init not required
    if (!conversations[conversationId] && !conversationInitRequired) {
        conversations[conversationId] = {
            conversationId,
            history: [],
        };
    }
    return conversations[conversationId];
};
const getBotDataKey = (channelId, conversationId, userId) => {
    return `$${channelId || '*'}!${conversationId || '*'}!${userId || '*'}`;
};
const setBotData = (channelId, conversationId, userId, incomingData) => {
    const key = getBotDataKey(channelId, conversationId, userId);
    const newData = {
        eTag: new Date().getTime().toString(),
        data: incomingData.data,
    };
    if (incomingData) {
        botDataStore[key] = newData;
    }
    else {
        delete botDataStore[key];
        newData.eTag = '*';
    }
    return newData;
};
const getBotData = (req, res) => {
    const key = getBotDataKey(req.params.channelId, req.params.conversationId, req.params.userId);
    console.log('Data key: ' + key);
    res.status(200).send(botDataStore[key] || { data: null, eTag: '*' });
};
const setUserData = (req, res) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
};
const setConversationData = (req, res) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
};
const setPrivateConversationData = (req, res) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
};
const deleteStateForUser = (req, res) => {
    Object.keys(botDataStore)
        .forEach((key) => {
        if (key.endsWith(`!{req.query.userId}`)) {
            delete botDataStore[key];
        }
    });
    res.status(200).send();
};
// CLIENT ENDPOINT HELPERS
const createMessageActivity = (incomingActivity, serviceUrl, conversationId) => {
    return Object.assign(Object.assign({}, incomingActivity), { channelId: 'emulator', serviceUrl, conversation: { id: conversationId }, id: uuidv4() });
};
const createConversationUpdateActivity = (serviceUrl, conversationId) => {
    const activity = {
        type: 'conversationUpdate',
        channelId: 'emulator',
        serviceUrl,
        conversation: { id: conversationId },
        id: uuidv4(),
        membersAdded: [],
        membersRemoved: [],
        from: { id: 'offline-directline', name: 'Offline Directline Server' },
    };
    return activity;
};
const conversationsCleanup = () => {
    setInterval(() => {
        const expiresTime = moment().subtract(expiresIn, 'seconds');
        Object.keys(conversations).forEach((conversationId) => {
            if (conversations[conversationId].history.length > 0) {
                const lastTime = moment(conversations[conversationId].history[conversations[conversationId].history.length - 1].localTimestamp);
                if (lastTime < expiresTime) {
                    delete conversations[conversationId];
                    socketPort_1.cleanUpConversation(conversationId);
                    console.log('deleted cId: ' + conversationId);
                }
            }
        });
    }, conversationsCleanupInterval);
};
//# sourceMappingURL=bridge.js.map