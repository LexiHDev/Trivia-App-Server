const axios = require("axios");
const dotenv = require("dotenv");
const WebSocket = require("ws");
const yup = require("yup");
const nanoid = require("nanoid");

dotenv.config();

const twitch_header = {
	headers: {
		Authorization: process.env.AUTH,
		"Client-Id": process.env.CLIENTID,
	},
};

let room_info = {};
let trivia_at = "";
let clients = [];
let rooms = { "": [] };

const msg_schema = yup.object({
	type: yup
		.string()
		.required()
		.matches(/[a-z]*/i),
	payload: yup
		.object({
			user: yup.string().optional(),
			game: yup
				.object({
					rounds: yup.number().min(3).max(50).integer(),
					round_length: yup.number().integer().min(10).max(120),
				})
				.optional(),
			answer: yup.number().integer().min(0).max(3).optional(),
			lobby: yup.string().optional()
		})
		.required(),
});

const wss = new WebSocket.Server({ port: process.env.PORT });

wss.on("connection", (ws) => {
	const msg_handler = (msg) => {
		
		/* I'm pretty sure this is unsafe, but this isn't a production ready app...
		so caution to the wind! */ 
		try {
			msg = JSON.parse(msg.toString());
		} 
		catch (err) {
			ws.send("Incoming msg invalid");
			return 0;
		}

		if (msg_schema.isValidSync(msg)) {
			ws.payload = msg.payload;
			switch (msg.type) {
			case "register":
				register_handler(ws);
				break;
			case "create_lobby":
				create_lobby(ws);
				break;
			case "join_lobby":
				join_lobby(ws);
				break;
			case "start_game":
				start_game(ws);
				break;
			case "answer":
				answer_handler(ws);
				break;
			}
		} else {
			ws.send(quick_json(msg_schema.validate(msg)));
		}
	};
	ws.on("message", msg_handler);
});

const register_handler = async (ws) => {
	console.log("User registering as: " + ws.payload.user);
	ws.user = {
		user_name: ws.payload.user,
		score: 0,
		pfpUrl: "",
	};
	await axios
		.get(
			`https://api.twitch.tv/helix/users?login=${ws.user.user_name}`,
			twitch_header
		)
		.then((res) => {
			ws.user.pfpUrl = res.data.data[0].profile_image_url;
			ws.registered = true;
			ws.send(
				quick_json({
					type: "registered",
					payload: {
						message: "Successfully signed in as: " + ws.user.user_name,
						pfpUrl: ws.user.pfpUrl,
					},
				})
			);
			clients.push(ws);
		})
		.catch((err) => {
			console.error(err);
		});
};

const quick_json = (msg) => {
	/* TODO
   * Add some outgoing verification.
   * error stuff
   */
	return JSON.stringify(msg);
};
const join_lobby = (ws) => {
	if (ws.lobby) {
		rooms[ws.lobby] = rooms[ws.lobby].filter((client) => client !== ws);
	}
	
	if (rooms[ws.payload.lobby]) {
		rooms[ws.payload.lobby].push(ws);
		ws.lobby = ws.payload.lobby;
		ws.send(quick_json({
			type: "joined_lobby",
			payload: {
				lobby: ws.payload.lobby
			}
		}));
	} else {
		ws.send(quick_json({
			type: "join_failed",
			payload: {
				message: "Failed to join lobby: " + ws.payload.lobby 
			}
		}));
	}
};

const create_lobby = (ws) => {
	const lobbyID = nanoid.nanoid(6);
	if (!room_info[lobbyID]) {
		rooms[lobbyID] = [];
		room_info[lobbyID] = {};
		room_info[lobbyID].admin = ws;
		room_info[lobbyID].rounds = ws.payload.rounds;
		room_info[lobbyID].round_length = ws.payload.round_length;
		room_info[lobbyID].round = 0;
		ws.lobby = lobbyID;
		rooms[lobbyID].push(ws);
		ws.send(quick_json({ type: "lobby_created", payload: { lobby: lobbyID } }));
	} else {
		ws.send(
			quick_json({
				type: "failed_lobby_create",
				payload: { message: "Collides with lobby" },
			})
		);
	}
};

const start_game = async (ws) => {
	room_info[ws.lobby].trivia = await get_trivia(room_info[ws.lobby].rounds);
	let curQ;
	let gameLoop = () => {
		/*
     * Add all users registered and in the lobby to the room
     * Better implementation would be to use UUIDs for each ws, but this is fine.
     */
		room_info[ws.lobby].playing = rooms[ws.lobby].filter(
			(cli) => cli.registered
		);

		/*
     * Set up the current question on all the current players.
     */
		curQ = room_info[ws.lobby].trivia.shift();
		const correctAns = curQ.correct_answer;
		const currAnswers = [curQ.correct_answer, ...curQ.incorrect_answers].sort();
		room_info[ws.lobby].playing.forEach((player) => {
			player.answers = currAnswers;
			player.correctAns = correctAns;
		});

		room_info[ws.lobby].playing.forEach((player) => {
			player.send(
				quick_json({
					type: "question",
					payload: {
						question: curQ.question,
						answers: currAnswers,
						users: rooms[ws.lobby].map((player) => player.user),
						round_length: room_info[ws.lobby].round_length,
						round: room_info[ws.lobby].round
					},
				})
			);
		});

		console.log(`[${ws.lobby}]:\n` + quick_json(curQ, true));

		/*
     * Check for final round.
     */
		if (room_info[ws.lobby].rounds - 1 == room_info[ws.lobby].round) {
			clearInterval(room_info[ws.lobby].gameLoop);
			room_info[ws.lobby].round = 0;
			setTimeout(() => {
				
				room_info[ws.lobby].playing.forEach((player) => {
					player.send(quick_json({
						type: "game_done",
						payload: {
							users: rooms[ws.lobby]
								.map(player => player.user)
								.sort((oldPlayer, newPlayer) => oldPlayer.score - newPlayer.score)
						}
					}));
				});
			}, room_info[ws.lobby].round_length * 1000);
		}
		room_info[ws.lobby].round += 1;
		
	};
	gameLoop();
	room_info[ws.lobby].gameLoop = setInterval(gameLoop, room_info[ws.lobby].round_length * 1000);
};

const answer_handler = (ws) => {
	if (ws.payload.answer && ws.answer == ws.answers[ws.payload.answer]) {
		ws.user.score += 1;
		ws.answer == undefined;
		ws.send(quick_json({
			type: "answered",
			payload: {response: "correct"}
		}));
	} else {
		ws.send(quick_json({
			type: "answered",
			payload: {response: "incorrect"}
		}));
	}
};

const get_trivia = async (rounds) => {
	let trivia;
	await axios
		.get("https://opentdb.com/api_token.php?command=request")
		.then((result) => {
			trivia_at = result.data.token;
		});
	if (trivia_at !== "") {
		/*
		* TODO:
		* Select different type
		* Select different categories
		* INFO: 
		* Category 15 is Video Game Trivia
		 */
		
		await axios
			.get(
				`https://opentdb.com/api.php?category=15&type=multiple&encode=base64&amount=${rounds}&token=${trivia_at}`
			)
			.then((res) => {
				if (res.data.response_code == 0) {
					trivia = res.data.results;
				} else {
					console.error("error!\n", res.data, "\nwith rounds / token:", `${rounds}:${trivia_at}`);
					process.exit();
				}
			});
	}
	return trivia;
};
