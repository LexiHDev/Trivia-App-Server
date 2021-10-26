const WebSocket = require('ws');
const game = require('./game');
const yup = require("yup")

const wss = new WebSocket.Server({ port: 1447 })
const msgSchema = yup.array().required().max(2).min(1)
const roundsSchema = yup.number().min(3).max(20).required().integer()


wss.on('connection', ws => {
    ws.on('message', async message => {
        const msg = `${message}`.split(" ")
        if (msgSchema.isValidSync(msg)) {
            if (msg[0] == "start_game") {
                let rounds = 2
                if (msg.length > 1) {
                    rounds = roundsSchema.isValidSync(msg[1]) ? msg[1] : rounds
                }
                ws.send("Starting game in 10 seconds")
                let game = {'round':0, 'func':setInterval(() => {
                    ws.send("Message sent after 3 seconds")
                    game.round += 1
                    if ( game.round == rounds ) {
                        clearInterval(game.func)
                    }
                }, 300)}
            } else {
                ws.send(`Error Unknown Message: ${msg}`)
            }
        } else {
            ws.send("Incorrect message type sent.")
        }
    })
    ws.send(`Hello, you are connected with ${wss.clients.size - 1} other users!`)
})

const server_start = (ws) => {
    ws.send(`Starting server with ${wss.clients.size} clients.`)

    setTimeout()
}