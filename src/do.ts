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

const CellValueSchema = z.union([z.number(), MarkSchema]);
type CellValue = z.infer<typeof CellValueSchema>;

const BoardSchema = z.array(z.array(CellValueSchema));
type Board = z.infer<typeof BoardSchema>;

const CoordinatesSchema = z.array(z.number());
type Coordinates = z.infer<typeof CoordinatesSchema>;

const TokenHashSchema = z.instanceof(ArrayBuffer);
type TokenHash = z.infer<typeof TokenHashSchema>;

const StateSchema = z.object({
  board: BoardSchema,
  turn: PlayerSchema, // Who's turn is it?
  started: z.boolean(), // did game start?
  winner: PlayerSchema.nullable(), // who is the winner
  gameOver: z.boolean(), // Is the game over?
  first: PlayerSchema, // First move
  streamerMark: MarkSchema, // Which mark streamer uses?
  winnerCoordinates: z.array(CoordinatesSchema), // array of coordinate pairs
});
export type State = z.infer<typeof StateSchema>;

/** A Durable Object's behavior is defined in an exported Javascript class */
export class TicTacToeDO extends DurableObject<Env> {
  storage: DurableObjectStorage;
  state: State;

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
    this.state = this.getEmptyState();

    this.ctx.blockConcurrencyWhile(async () => {
      // load the state from the database or create a new one
      if (!(await this.loadState())) {
        await this.initState();
      }
    });
  }

  private async saveState() {
    await this.storage.put('state', this.state);
  }

  private async initState() {
    console.log('!!! invalidating state, cleaning up and creating a new one !!!');

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
        return true;
      }
    } catch (err) {}

    return false;
  }

  private getEmptyState(): State {
    const emptyState = {
      board: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      turn: Player.STREAMER, // Who's turn is it? true = streamer, false = chat
      started: false,
      winner: null, // who is the winner: true = streamer, false = chat, null = draw or unknown
      gameOver: false, // Is the game over?

      // these are config options
      first: Player.STREAMER, // First move: true = streamer, false = chat
      streamerMark: Mark.X, // Which mark streamer uses? true = X, false = O
      winnerCoordinates: [],
    };

    if (emptyState.first === Player.STREAMER) {
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

  private broadcaseState() {
    // send new state to all connected clients
    const sockets = this.ctx.getWebSockets();
    sockets.forEach((ws) => {
      try {
        ws.send(JSON.stringify(this.state));
      } catch (err) {
        console.log('could not send messages to:', ws);
      }
    });
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

  async webSocketMessage(ws: WebSocket, messageString: ArrayBuffer | string) {
    console.log('ws', ws);

    if (typeof messageString === 'string') {
      const message = JSON.parse(messageString);

      // restart the game
      if (message.restart) {
        this.state = this.getEmptyState();
        await this.saveState();

        this.broadcaseState();
      }

      if (message.move) {
        const [y, x] = message.move;

        // check if coordinates are valid
        if (x < 0 || x > 2 || y < 0 || y > 2) {
          console.log('invalid coordinates', x, y);
          return;
        }

        // figure out who is the player and which mark to use
        let mark: Mark;
        if (this.state.turn === Player.STREAMER) {
          // streamer made a move
          mark = this.state.streamerMark;
        } else {
          // chat made a move
          mark = this.state.streamerMark === Mark.X ? Mark.O : Mark.X;
        }

        // ignore invalide moves
        if (this.state.board[x][y] !== 0) {
          console.log('invalid move', x, y);
          return;
        }

        // make the game board change
        this.state.board[x][y] = mark;

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
          if (winnerMark === this.state.streamerMark) {
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

        await this.saveState();

        this.broadcaseState();
      }

      // user connected, let's send this user the current state
      if (message.connected) {
        try {
          ws.send(JSON.stringify(this.state));
        } catch (err) {
          console.log('could not send messages to:', ws);
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
    ws.close(code, 'Durable Object is closing WebSocket');
  }
}
