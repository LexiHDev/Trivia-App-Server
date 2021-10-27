const WebSocket = require('ws');
const yup = require('yup');
const axios = require('axios');

const messageSchema = yup.object({
    cmd: yup.string().required().matches(/[a-z]*/),
    rounds: yup.number().min(3).max(50).integer(),
    round_length: yup.number().integer().min(3).max(60)
})
const wss = new WebSocket.Server({ port: 1447 })

let clients = []
let playing = []
let listeners = []
let trivia = []
let trivia_at = ""

 

wss.on('connection', ws => {
    clients.push(ws);
    ws.on('message', )
})

const startListener = (ws, round_length) => {
    clients.forEach(cli => {
        cli.on('message', () => {
            
        })
    })
}

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