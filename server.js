const WebSocket = require('ws');
const game = require('./game');
const yup = require("yup");
const { default: axios } = require('axios');

const wss = new WebSocket.Server({ port: 1447 })
const msgSchema = yup.array().required().max(3).min(1)
const roundsSchema = yup.number().min(3).max(20).required().integer()
const cmdSchema = yup.string().required().matches(/[a-z]*/)
const rLengthS = yup.number().integer().min(30).max(120).required()
const messageSchema = yup.object({
    cmd: yup.string().required().matches(/[a-z]*/),
    rounds: yup.number().min(3).max(50).integer(),
    round_length: yup.number().integer().min(300).max(120000)
})

let trivia = []
let trivia_at = ""

wss.on('connection', ws => {
    ws.on('message', async message => {
        const errHandle = err => {
            ws.send(err)
        }

        let round_length = 3000
        let rounds = 2
        const msg = JSON.parse(message.toString())
        if (!messageSchema.validateSync(msg)) {
            ws.send("Message is not valid. Try again")
        }
        if (msg.cmd == "start_game") {
            rounds = msg.rounds ? msg.rounds : rounds
            round_length = msg.round_length ? msg.round_length : round_length
            await populate_trivia(rounds, errHandle)
            ws.send(`Starting game with paramaters: ` + JSON.stringify(msg))
            const gameLoop = () => {
                ws.send(`Message sent after ${round_length / 10} seconds\n ${JSON.stringify(trivia.shift())}\n ${game.round + 1}/${rounds}`)
    game.round += 1
    if (game.round === rounds) {
        clearInterval(game.gameLoop)
    }
}
            let game = {
    'round': 0, 'gameLoop': setInterval(gameLoop, round_length)
}
            gameLoop()
        }
    })
ws.send(`Hello, you are connected with ${wss.clients.size - 1} other users!`)
})

const populate_trivia = async (rounds, errHandle) => {
    if (trivia_at === '') {
        await axios.get('https://opentdb.com/api_token.php?command=request').then(result => {
            trivia_at = result.data.token
            console.log(trivia_at)
        })
    }
    if (trivia_at !== "") {
        await axios.get(`https://opentdb.com/api.php?category=15&amount=${rounds}&token=${trivia_at}`).then(res => {
            if (res.data.response_code == 0) {
                trivia = res.data.results
            } else {
                errHandle("error! shutting down")
                process.exit()
            }
        })
    }
}