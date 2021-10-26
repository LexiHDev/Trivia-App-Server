const WebSocket = require('ws');
const game = require('./game');
const yup = require("yup")

const wss = new WebSocket.Server({ port: 1447 })
const msgSchema = yup.array().required().max(3).min(1)
const roundsSchema = yup.number().min(3).max(20).required().integer()
const cmdSchema = yup.string().required().matches(/[a-z]*/)
const rLengthS = yup.number().integer().min(30).max(120).required()
const messageSchema = yup.object({
    cmd: yup.string().required().matches(/[a-z]*/),
    rounds: yup.number().min(3).max(50).integer(),
    round_length: yup.number().integer().min(30000).max(120000)
})

let trivia = []

wss.on('connection', ws => {
    ws.on('message', async message => {
        let round_length = 3000
        let rounds = 2
        const msg = JSON.parse(message.toString())
        if (!messageSchema.validateSync(msg)) {
            ws.send("Message is not valid. Try again")
        }
        if (msg.cmd == "start_game") {
            rounds = msg.rounds ? msg.rounds : rounds
            round_length = msg.round_length ? msg.round_length : round_length
            ws.send(`Starting game with paramaters: ` + JSON.stringify(msg))
            let game = {
                'round': 0, 'func': setInterval(() => {
                    ws.send(`Message sent after ${round_length / 10} seconds `)
                    game.round += 1
                    if (game.round == rounds) {
                        clearInterval(game.func)
                    }
                }, round_length)
            }
        }
    })
    ws.send(`Hello, you are connected with ${wss.clients.size - 1} other users!`)
})

const server_start = (ws) => {
    ws.send(`Starting server with ${wss.clients.size} clients.`)

    setTimeout()
}