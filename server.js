const WebSocket = require('ws');
const yup = require("yup");
const { default: axios } = require('axios');
const { WebSocketServer } = require('ws');

const wss = new WebSocket.Server({ port: 1447 })
const messageSchema = yup.mixed()
yup.object({
    cmd: yup.string().required().matches(/[a-z]*/),
    rounds: yup.number().min(3).max(50).integer(),
    round_length: yup.number().integer().min(300).max(120000)
})
let game_running = false

let clients = []
let playing = []
let listeners = []
let new_conns = []
let trivia = []
let trivia_at = ""


const validateAnswerListener = (conn, msg, curQ) => {
    conn.send(JSON.stringify(msg));
    playing.push(conn.on('message', () => { }))
    const z = client_response => {
        if (client_response == curQ.correct_answer) {
            conn.send(true);
        } else {
            conn.send(false);
        }
        return z
    }
}

const gameLoop = () => {
    
    listenForPlayers
    const curQ = trivia.shift()
    const msg = { question: curQ.question, answers: [curQ.correct_answer, ...curQ.incorrect_answers].sort() }
    clrListener.forEach(listener => {
        console.log(getEventListeners().toString);
    })
    
    playing.forEach(client => {
        clrListener.push(validateAnswerListener(client, msg, curQ))
    });
    
    game.round += 1
    if (game.round === rounds) {
        game_running = false
        clearInterval(game.gameLoop)
    }
}

const listenForPlayers = async (ws, client_res) => {
    
    let round_length = 30
    playing = [...clients]
    
    
    const msg = JSON.parse(msesage.toString())
    messageSchema.validate(client_res).then(async () => {
        if (client_res.cmd == 'start_game' && game_running == false) {
            rounds = client_res.rounds ?? rounds;
            round_length = client_res.round_length ?? round_length;
            await populate_trivia(rounds)
            ws.send("Starting game with paramaters: \n" + JSON.stringify(client_res))
            game_running = true
            playing = [...clients];
            
        }
        
    })
}



wss.on('connection', ws => {
    clients.push(ws)
    ws.on('message', async message => {
        let rounds = 3
        const errHandle = err => {
            ws.send(err)
        }
        await populate_trivia(rounds)
        gameLoop(round_length)
        // let round_length = 3000
        // let rounds = 2
        // const msg = JSON.parse(message.toString())
        // messageSchema.validate(msg).then(async () => {
        //     if (msg.cmd == "start_game" && game_running == false) {
        //         rounds = msg.rounds ? msg.rounds : rounds
        //         round_length = msg.round_length ? msg.round_length : round_length
        //         await populate_trivia(rounds, errHandle)
        //         ws.send(`Starting game with paramaters: ` + JSON.stringify(msg))
        //         game_running = true
        //         let game = {
        //             'round': 0, 'gameLoop': setInterval(gameLoop, round_length)
        //         }
        //         gameLoop()
        //     }
        ws.on('close', () => (clients = clients.filter((conn) => (conn === ws ? false : true))))
    })
    ws.send(`Hello, you are connected with ${wss.clients.size - 1} other users!`)
})


const populate_trivia = async (rounds) => {
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
                console.error("error!\n", res.data)
                process.exit()
            }
        })
    }
}