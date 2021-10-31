const axios = require("axios");
const dotenv = require("dotenv");
const WebSocket = require("ws");
const yup = require("yup");
const nanoid = require("nanoid");

dotenv.config();

const twitchHeader = {
	headers: {
		Authorization: process.env.AUTH,
		"Client-Id": process.env.CLIENTID,
	},
};

let clients = [];
let rooms = { "": [] };

const msgSchema = yup.object({
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
					round_length: yup.number().integer().min(3).max(5),
				})
				.optional(),
			answer: yup.number().integer().min(0).max(3).optional(),
		})
		.required(),
});

const wss = new WebSocket.Server({ port: process.env.PORT });

wss.on("connection", (ws) => {
	const msgHandler = (msg) => {
		if (msgSchema.isValidSync(msg)) {
			ws.payload = msg.payload;
			switch (msg.type) {
			case "register":
				registerHandler(ws);
				break;
			case "create_lobby":
				create_lobby(ws);
				break;
			case "join_lobby":
				join_lobby(ws);
				break;
			case "start_game":
				startGame(ws);
				break;
			case "answer":
				answerHandler(ws);
				break;
			}
		} else {
			ws.send(msgSchema.validate(msg));
		}
	};
	ws.on("message", msgHandler);
});

const registerHandler = async (ws) => {
	console.log("user registering as: " + ws.payload.user_name);
	ws.user = {
		user_name: ws.payload.user_name,
		score: 0,
		pfpUrl: "",
	};
	await axios
		.get(
			`https://api.twitch.tv/helix/users?login=${ws.user.user_name}`,
			twitchHeader
		)
		.then((res) => {
			ws.user.pfpUrl = res.data.data[0].profile_image_url;
			ws.registered = true;
			ws.send(
				quickJSON({
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

const quickJSON = (msg) => {
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
};

const create_lobby = (ws) => {
	const lobbyID = nanoid.nanoid(6);
	rooms[lobbyID] = [];
	ws.lobby = lobbyID;
	rooms[lobbyID].push(ws);
	ws.send(quickJSON({ type: "lobby_created", payload: { lobby: lobbyID } }));
	
};
