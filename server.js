const WebSocket = require('ws');
const yup = require('yup');
const axios = require('axios');
const dotenv = require('dotenv')
dotenv.config()
const twitchHeader = {
  headers: {
    Authorization: process.env.AUTH,
    "Client-Id": process.env.CLIENTID
  }
}

const messageSchema = yup.object({
  cmd: yup
    .string()
    .required()
    .matches(/[a-z]*/),
  user: yup.string().optional(),
  game: yup.object({
    rounds: yup.number().min(3).max(50).integer(),
    round_length: yup.number().integer().min(3).max(60),
  }).optional(),
  answer: yup.number().integer().min(0).max(3).optional(),
  // user: yup.string().required()
});

const userSchema = yup.string().min(3).max(16)
const gameSchema = yup.object({
  rounds: yup.number().min(3).max(50).integer(),
  round_length: yup.number().integer().min(3).max(60),
})

const wss = new WebSocket.Server({ port: process.env.PORT });

let loop = {}
let clients = [];
let playing = [];
let trivia = [];
let trivia_at = '';
let accepting = true;

wss.on('connection', (ws) => {
  ws.on('close', () => (clients = clients.filter((conn) => conn !== ws)))
  clients.push(ws);
  ws.registered = false
  ws.on('message', (msg) => {
    msgHandler(ws, msg);
    registerListener(ws)
  });
  listener(ws)
});

const registerListener = async (ws) => {
  console.log(twitchHeader)
  if (ws.msg?.cmd == 'register' && userSchema.isValidSync(ws.msg?.user)) {
    console.log('Registering :', ws.msg?.user)
    // console.log('registered as')
    ws.user = {
      user_name: ws.msg?.user,
      score: 0,
      pfpUrl: ""
    }
    await axios.get(`https://api.twitch.tv/helix/users?login=${ws.user?.user_name}`, twitchHeader)
      .then(res =>
        ws.user.pfpUrl = res.data.data[0].profile_image_url
        ).catch(err => {
          console.error(err)
        })
    ws.registered = true
    console.log("sending:\n" + JSON.stringify({ "cmd": "Signed in as: " + ws.user.user_name }))
    ws.send(JSON.stringify({ "cmd": "Signed in as: " + ws.user.user_name }))
    clients.forEach(cli => {
      console.log("Sending:" + JSON.stringify(clients.map(cli => cli.user).filter(cli => cli != undefined)))
      cli.send(JSON.stringify({ cmd: "users", users: clients.map(cli => cli.user).filter(cli => cli != undefined) }))
    })
  }
}

const msgHandler = (ws, msg) => {
  let message = {}
  try {
    message = JSON.parse(msg.toString());
  } catch (err) {
    ws.send(JSON.stringify({ "error": msg.toString() + ' is invalid JSON' }));
    console.error(msg.toString() + ' is invalid JSON');
    return -1;
  }
  console.log(message, messageSchema.isValidSync(message))
  if (messageSchema.isValidSync(message)) {
    ws.msg = message
    ws.send(JSON.stringify(ws.msg));
  }
};

const listener = (ws) => {
  ws.on('message', () => {
    if (accepting) {
      listenForStart(ws)
    } else if ( ws.answer ) {
      listenForAnswers(ws)
    }
  })
};

const listenForStart = async (ws) => {
  // console.log("listen for start", ws.msg, gameSchema.isValidSync(ws.msg?.game))
  if (ws.msg.cmd == 'start_game' && gameSchema.isValidSync(ws.msg.game)) {
    await populate_trivia(ws.msg.game.rounds)
    // console.log('at:', trivia)
    start_trivia(ws)
  }
}

const start_trivia = (ws) => {
  accepting = false
  let round = 0
  let curQ = {}
  ws.curGame = ws.msg.game
  let gameLoop = () => {
    playing = clients.filter(client => client.registered)
    curQ = trivia.shift();
    ws.answer = curQ.correct_answer
    ws.answers = [curQ.correct_answer, ...curQ.incorrect_answers].sort()
    playing.forEach(player => {
      player.answers = ws.answers
      player.answer = ws.answer
    })
    console.log(curQ)
    ws.information = {
      cmd: "trivia_question",
      question: {
        question: curQ.question,
        answers: ws.answers,
      },
      users: playing.map(player => player.user)
    }

    playing.forEach(client => {
      client.send(JSON.stringify(ws.information))
    })
    round += 1;
    // console.log(curQ)
    if (ws.curGame.rounds == round) {
      clearInterval(loop)
      playing.forEach(client => {
        client.user.score = 0
      })
      accepting = true
    }
  }
  gameLoop()
  loop = setInterval(gameLoop, ws.curGame.round_length * 1000)
}


const listenForAnswers = (ws) => {
  // console.log(ws.msg?.answer, ws.answer, ws.answers)
  if (ws.answer == ws.answers[Number(ws.msg?.answer)]) {
    ws.user.score += 1
    ws.answer = undefined
    ws.send('correct');
  } else ws.send('incorrect')
};

const populate_trivia = async (rounds) => {
  if (trivia_at === '') {
    await axios
      .get('https://opentdb.com/api_token.php?command=request')
      .then((result) => {
        trivia_at = result.data.token;
      });
  }
  if (trivia_at !== '') {
    await axios
      .get(
        `https://opentdb.com/api.php?category=15&type=multiple&encode=base64&amount=${rounds}&token=${trivia_at}`,
      )
      .then((res) => {
        if (res.data.response_code == 0) {
          trivia = res.data.results;
        } else {
          console.error('error!\n', res.data);
          process.exit();
        }
      });
  }
};
