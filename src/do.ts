import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

// configuration settings
export enum Player {
  STREAMER = 'streamer',
  CHAT = 'chat',
}
const PlayerSchema = z.nativeEnum(Player);

// values of the state object
export enum Mark {
  X = 'X',
  O = 'O',
}
const MarkSchema = z.nativeEnum(Mark);

// game modes
export enum GameMode {
  REGULAR = 'regular',
  VOTE = 'vote',
}
const GameModeSchema = z.nativeEnum(GameMode);

const CellValueSchema = z.union([z.number(), MarkSchema]);
type CellValue = z.infer<typeof CellValueSchema>;

const BoardSchema = z.array(z.array(CellValueSchema));
type Board = z.infer<typeof BoardSchema>;

const CoordinatesSchema = z.array(z.number());
type Coordinates = z.infer<typeof CoordinatesSchema>;

const TokenHashSchema = z.instanceof(ArrayBuffer);
type TokenHash = z.infer<typeof TokenHashSchema>;

export const CHAT_TURN_TIME_MIN = 1;
export const CHAT_TURN_TIME_MAX = 300;
export const CHAT_TURN_TIME_DEFAULT = 15;

const SettingsSchema = z.object({
  first: PlayerSchema, // First move: true = streamer, false = chat
  streamerMark: MarkSchema, // Which mark streamer uses? true = X, false = O
  chatTurnTime: z.number().min(CHAT_TURN_TIME_MIN).max(CHAT_TURN_TIME_MAX), // How long chat has to make a move in seconds
  gamesPerRound: z.number(), // How many games to play in a row
  mode: GameModeSchema, // Game mode: regular or vote
});

type Settings = z.infer<typeof SettingsSchema>;

const StateSchema = z.object({
  board: BoardSchema,
  turn: PlayerSchema, // Who's turn is it?
  // started: z.boolean(), // did game start?
  winner: PlayerSchema.nullable(), // who is the winner
  gameOver: z.boolean(), // Is the game over?
  winnerCoordinates: z.array(CoordinatesSchema), // array of coordinate pairs
  settings: SettingsSchema, // game settings
  votes: z.array(CoordinatesSchema).optional(),
  voteEndTime: z.number().optional(),
  voters: z.record(z.string(), CoordinatesSchema).optional(), // map of sessionId -> [col, row]
});
export type State = z.infer<typeof StateSchema>;

/** A Durable Object's behavior is defined in an exported Javascript class */
export class TicTacToeDO extends DurableObject<Env> {
  storage: DurableObjectStorage;
  state: State;
  settings: Settings;

  /**
   * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
   * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
   *
   * @param ctx - The interface for interacting with Durable Object state
   * @param env - The interface to reference bindings declared in wrangler.jsonc
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.storage = ctx.storage;

    // default settings that can be overriden from the state if it exists
    this.settings = {
      first: Player.STREAMER, // First move: true = streamer, false = chat
      streamerMark: Mark.X, // Which mark streamer uses? true = X, false = O
      chatTurnTime: CHAT_TURN_TIME_DEFAULT, // How long chat has to make a move in seconds
      gamesPerRound: 3, // How many games to play in a row
      mode: GameMode.REGULAR, // Game mode
    };
    this.state = this.getEmptyState();

    this.ctx.blockConcurrencyWhile(async () => {
      // load the state from the database or create a new one
      if (!(await this.loadState())) {
        await this.initStateStorage();
      }
    });
  }

  private async saveState() {
    await this.storage.put('state', this.state);
  }

  private async initStateStorage() {
    console.log('!!! invalidating stored state, cleaning up and creating a new one !!!');

    // delete any corrupted, unparse-able state if there was any
    await this.storage.delete('state');

    // create a single row in the table
    await this.storage.put('state', this.state);
  }

  private async loadState(): Promise<boolean> {
    try {
      const result: State = StateSchema.parse(await this.storage.get('state'));
      if (typeof result !== 'undefined') {
        this.state = result;
        this.settings = result.settings;
        this.state.settings = this.settings;
        return true;
      }
    } catch (err) {}

    return false;
  }

  private getEmptyState(): State {
    const emptyState: State = {
      board: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      turn: Player.STREAMER, // Who's turn is it? true = streamer, false = chat
      // started: false,
      winner: null, // who is the winner: true = streamer, false = chat, null = draw or unknown
      gameOver: false, // Is the game over?
      winnerCoordinates: [], // array of coordinate pairs that make up the winning line
      settings: this.settings,
      votes: [],
      voteEndTime: undefined,
      voters: {},
    };

    if (emptyState.settings.first === Player.STREAMER) {
      emptyState.turn = Player.STREAMER;
    } else {
      emptyState.turn = Player.CHAT;
    }

    return emptyState;
  }

  /**
   * Web Socket server for updates and stuff
   *
   * @param request
   * @returns
   */
  async fetch(request: Request): Promise<Response> {
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    let sessionId = url.searchParams.get('sessionId');

    if (token && (await this.checkToken(token))) {
      // If the token is valid, we can record it as an attachment to the WebSocket.
      // This will allow us to retrieve it later in the `webSocketMessage()` handler.
      server.serializeAttachment({ token });
    } else {
      // Assign a random session ID to unauthenticated users if not provided
      if (!sessionId) {
        sessionId = crypto.randomUUID();
      }
      server.serializeAttachment({ sessionId });
    }

    // Calling `acceptWebSocket()` informs the runtime that this WebSocket is to begin terminating
    // request within the Durable Object. It has the effect of "accepting" the connection,
    // and allowing the WebSocket to send and receive messages.
    // Unlike `ws.accept()`, `state.acceptWebSocket(ws)` informs the Workers Runtime that the WebSocket
    // is "hibernatable", so the runtime does not need to pin this Durable Object to memory while
    // the connection is open. During periods of inactivity, the Durable Object can be evicted
    // from memory, but the WebSocket connection will remain open. If at some later point the
    // WebSocket receives a message, the runtime will recreate the Durable Object
    // (run the `constructor`) and deliver the message to the appropriate handler.
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private broadcastState() {
    // send new state to all connected clients
    const sockets = this.ctx.getWebSockets();
    sockets.forEach((ws) => this.sendState(ws));
  }

  private sendState(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as { token?: string; sessionId?: string } | null;
    const token = attachment?.token;
    const sessionId = attachment?.sessionId;
    const msg = { ...this.state, authorized: !!token, sessionId };

    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.log('could not send messages to:', ws);
    }
  }

  async getState(): Promise<State> {
    // return the current state
    return this.state;
  }

  private async hashToken(token: string): Promise<ArrayBuffer> {
    return await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  }

  private async verifyToken(token: string, storedHash: ArrayBuffer): Promise<boolean> {
    const tokenHash = await this.hashToken(token);

    // compare the hashes and return true if they match
    if (tokenHash.byteLength !== storedHash.byteLength) {
      return false; // hashes are not the same length, so they cannot match
    }

    const tokenHashBytes = new Uint8Array(tokenHash);
    const storedHashBytes = new Uint8Array(storedHash);

    for (let i = 0; i < tokenHashBytes.length; i++) {
      if (tokenHashBytes[i] !== storedHashBytes[i]) {
        return false; // hashes do not match
      }
    }

    return true; // hashes match
  }

  async checkToken(token: string): Promise<boolean> {
    // read the token from storage
    // if it does not exist, create it, otherwise check if they match
    // don't store the tocken itself, but rather a hash of it
    if (!token || token.length === 0) {
      return false; // invalid token
    }

    let storedHash: TokenHash | undefined = undefined;
    try {
      storedHash = TokenHashSchema.parse(await this.storage.get('tokenHash'));
    } catch (err) {}

    if (!storedHash) {
      // create a new hash and store it
      const newHash: ArrayBuffer = await this.hashToken(token);
      await this.storage.put('tokenHash', newHash);
      return true;
    }

    return await this.verifyToken(token, storedHash);
  }

  async startVoting() {
    // only start voting if it is chat's turn and we are in vote mode
    if (this.state.turn === Player.CHAT && this.settings.mode === GameMode.VOTE) {
      this.state.votes = [];
      this.state.voters = {}; // Reset voters
      this.state.voteEndTime = Date.now() + this.settings.chatTurnTime * 1000;
      await this.storage.setAlarm(this.state.voteEndTime);
    }
  }

  async alarm() {
    // The alarm handler is invoked when the scheduled alarm time is reached.
    // In this case, it means the voting period has ended.
    if (this.state.turn === Player.CHAT && this.settings.mode === GameMode.VOTE) {
      // count votes
      const voteCounts: Record<string, number> = {};
      let maxVotes = 0;
      let winningMove: Coordinates | null = null;

      if (this.state.votes && this.state.votes.length > 0) {
        for (const move of this.state.votes) {
          const key = `${move[0]},${move[1]}`;
          voteCounts[key] = (voteCounts[key] || 0) + 1;

          if (voteCounts[key] > maxVotes) {
            maxVotes = voteCounts[key];
            winningMove = move;
          }
        }
      }

      // If no votes, pick a random available cell
      if (!winningMove) {
        const availableMoves: Coordinates[] = [];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (this.state.board[r][c] === 0) {
              availableMoves.push([c, r]);
            }
          }
        }
        if (availableMoves.length > 0) {
          winningMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        }
      }

      // Reset voting state
      this.state.votes = [];
      this.state.voters = {}; // Reset voters
      this.state.voteEndTime = undefined;

      // Apply the winning move if there is one
      if (winningMove) {
        await this.applyMove(winningMove[1], winningMove[0]); // applyMove takes row, col (x, y)
        // Note: winningMove is [y, x] (col, row) from message.move
        // applyMove expects (row, col) as per my definition below
      }

      await this.saveState();
      this.broadcastState();
    }
  }

  async applyMove(row: number, col: number) {
    // figure out who is the player and which mark to use
    let mark: Mark;
    if (this.state.turn === Player.STREAMER) {
      // streamer made a move
      mark = this.state.settings.streamerMark;
    } else {
      // chat made a move
      mark = this.state.settings.streamerMark === Mark.X ? Mark.O : Mark.X;
    }

    // ignore invalide moves
    if (this.state.board[row][col] !== 0) {
      console.log('invalid move', row, col);
      return;
    }

    // make the game board change
    this.state.board[row][col] = mark;

    // let the other side make a move next
    if (this.state.turn === Player.STREAMER) {
      this.state.turn = Player.CHAT;
    } else {
      this.state.turn = Player.STREAMER;
    }

    // check if the game is over
    let over = false;
    let winnerMark = null;
    // check rows
    for (let i = 0; i < 3; i++) {
      if (this.state.board[i][0] !== Mark.X && this.state.board[i][0] !== Mark.O) {
        continue;
      }

      if (this.state.board[i][0] === this.state.board[i][1] && this.state.board[i][1] === this.state.board[i][2]) {
        over = true;
        winnerMark = this.state.board[i][0];
        this.state.winnerCoordinates.push([i, 0], [i, 1], [i, 2]);
      }
    }
    // check columns
    for (let i = 0; i < 3; i++) {
      if (this.state.board[0][i] !== Mark.X && this.state.board[0][i] !== Mark.O) {
        continue;
      }
      if (this.state.board[0][i] === this.state.board[1][i] && this.state.board[1][i] === this.state.board[2][i]) {
        over = true;
        winnerMark = this.state.board[0][i];
        this.state.winnerCoordinates.push([0, i], [1, i], [2, i]);
      }
    }
    // check diagonals
    if (this.state.board[1][1] === Mark.X || this.state.board[1][1] === Mark.O) {
      if (this.state.board[0][0] === this.state.board[1][1] && this.state.board[1][1] === this.state.board[2][2]) {
        over = true;
        winnerMark = this.state.board[1][1];
        this.state.winnerCoordinates.push([0, 0], [1, 1], [2, 2]);
      }
      if (this.state.board[0][2] === this.state.board[1][1] && this.state.board[1][1] === this.state.board[2][0]) {
        over = true;
        winnerMark = this.state.board[1][1];
        this.state.winnerCoordinates.push([0, 2], [1, 1], [2, 0]);
      }
    }

    if (winnerMark !== null) {
      if (winnerMark === this.state.settings.streamerMark) {
        this.state.winner = Player.STREAMER;
      } else {
        this.state.winner = Player.CHAT;
      }
    }

    // check if the game is a draw
    if (
      this.state.board[0].every((cell) => cell !== 0) &&
      this.state.board[1].every((cell) => cell !== 0) &&
      this.state.board[2].every((cell) => cell !== 0)
    ) {
      over = true;
    }

    this.state.gameOver = over;

    // After a move, if it is now Chat's turn and mode is VOTE, start voting
    if (!this.state.gameOver && this.state.turn === Player.CHAT && this.settings.mode === GameMode.VOTE) {
      await this.startVoting();
    }
  }

  async webSocketMessage(ws: WebSocket, messageString: ArrayBuffer | string) {
    const attachment = ws.deserializeAttachment() as { token?: string; sessionId?: string } | null;
    const token = attachment?.token;
    const sessionId = attachment?.sessionId;

    if (typeof messageString === 'string') {
      const message = JSON.parse(messageString);

      // user connected, let's send this user the current state
      if (message.connected) {
        this.sendState(ws);
        return;
      }

      // restart the game
      if (message.restart) {
        this.state = this.getEmptyState();

        // If starting with CHAT turn in VOTE mode, start timer
        if (this.state.turn === Player.CHAT && this.settings.mode === GameMode.VOTE) {
          await this.startVoting();
        }

        await this.saveState();

        this.broadcastState();
        return;
      }

      if (message.move) {
        const [y, x] = message.move;

        // If no token is present (unauthenticated), and it's the streamer's turn, deny the move.
        if (!token && this.state.turn === Player.STREAMER) {
          console.log('Unauthenticated user tried to make a STREAMER move. Denied.');
          this.sendState(ws); // Send current state to inform client of denial (or just return)
          return;
        }

        // check if coordinates are valid
        if (x < 0 || x > 2 || y < 0 || y > 2) {
          console.log('invalid coordinates', x, y);
          return;
        }

        // If it is CHAT's turn and VOTE mode
        if (this.state.turn === Player.CHAT && this.settings.mode === GameMode.VOTE) {
          if (token) {
            // Authenticated user (Streamer) force-move during voting
            // Check if move is valid first
            if (this.state.board[x][y] !== 0) {
              console.log('Streamer tried invalid force move during voting');
              return;
            }

            // Cancel voting
            await this.storage.deleteAlarm();
            this.state.votes = [];
            this.state.voters = {}; // Reset voters
            this.state.voteEndTime = undefined;
            // Fall through to applyMove
          } else {
            // Record vote
            if (!this.state.voters) this.state.voters = {};
            if (sessionId) {
              this.state.voters[sessionId] = [y, x];

              // Rebuild votes array from voters map
              this.state.votes = Object.values(this.state.voters);
            } else {
              // Fallback for connections without sessionId (shouldn't happen with new logic)
              if (!this.state.votes) this.state.votes = [];
              this.state.votes.push([y, x]);
            }

            await this.saveState();
            this.broadcastState();
            return;
          }
        }

        await this.applyMove(x, y); // x is row, y is col

        await this.saveState();

        this.broadcastState();
        return;
      }

      // save settings only if the user is authorized
      if (token && message.settings) {
        const settings = SettingsSchema.parse(message.settings);
        const oldMode = this.settings.mode;

        // if this is the first turn, we need to check if first move setting has changed and update current turn
        if (
          !this.state.board.find((row) => row.find((cell) => cell === Mark.X || cell === Mark.O)) &&
          this.settings.first !== settings.first
        ) {
          if (settings.first === Player.STREAMER) {
            this.state.turn = Player.STREAMER;
          } else {
            this.state.turn = Player.CHAT;
          }
        }

        // if the streamer mark is changed, we need to swap marks on the the board
        if (this.settings.streamerMark !== settings.streamerMark) {
          this.state.board = this.state.board.map((row) =>
            row.map((cell) => {
              if (cell === Mark.X) {
                return Mark.O;
              } else if (cell === Mark.O) {
                return Mark.X;
              } else {
                return cell;
              }
            }),
          );
        }

        // update the state with new settings
        this.settings = settings;
        this.state.settings = this.settings;

        // If switching to VOTE mode and it is currently CHAT's turn, start voting
        if (settings.mode === GameMode.VOTE && this.state.turn === Player.CHAT) {
          if (oldMode !== GameMode.VOTE || !this.state.voteEndTime) {
            await this.startVoting();
          }
        }

        await this.saveState();

        this.broadcastState();
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
    ws.close(code, 'Durable Object is closing WebSocket');
  }
}
