const WebSocket = require('ws')
const WebSocketServer = require("ws").Server

/**
 * @param {WebSocket} ws - The WebSocket
 * @param {WebSocketServer} wss - The WebSocketServer
 */
const game = (ws, wss) => {
    return () => {
        wss.send("Hello test")
    }
}

module.exports = game