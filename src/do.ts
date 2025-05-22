import { DurableObject } from 'cloudflare:workers';

// Type that helps with retrieving JSON data from SQLite
type StateEntry = {
  json: string;
};

type CellValue = number | Mark;

type Player = boolean;

type Board = CellValue[][];

type Coordinates = number[];

type State = {
  board: Board;
  turn: Player; // Who's turn is it?
  started: boolean; // did game start?
  winner: Player | null; // who is the winner
  gameOver: boolean; // Is the game over?
  first: Player; // First move
  streamerMark: Mark; // Which mark streamer uses?
  winnerCoordinates: Coordinates[]; // array of coordinate pairs
};

// configuration settings
const STREAMER: Player = true;
const CHAT: Player = false;

// values of the state object
enum Mark {
  X = 'X',
  O = 'O',
}

/** A Durable Object's behavior is defined in an exported Javascript class */
export class TicTacToeDO extends DurableObject<Env> {
  sql: SqlStorage;
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
    this.sql = ctx.storage.sql;

    // table to hold a single entry in JSON format
    this.sql.exec(`
        CREATE TABLE IF NOT EXISTS state (
          json TEXT
        );
      `);

    this.state = this.getEmptyState();

    // load the state from the database or create a new one
    if (!this.loadState()) {
      this.initState();
    }
  }

  private saveState() {
    this.sql.exec('UPDATE state SET json = ?', JSON.stringify(this.state));
  }

  private initState() {
    // delete any corrupted, unparse-able state if there was any
    this.sql.exec('DELETE FROM state');

    // create a single row in the table
    this.sql.exec('INSERT INTO state (json) VALUES (?)', JSON.stringify(this.state));
  }

  private loadState() {
    try {
      const result = this.sql.exec<StateEntry>('SELECT json FROM state LIMIT 1').one();
      this.state = JSON.parse(result.json);
      return true;
    } catch (err) {
      return false;
    }
  }

  private getEmptyState(): State {
    const emptyState = {
      board: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      turn: STREAMER, // Who's turn is it? true = streamer, false = chat
      started: false,
      winner: null, // who is the winner: true = streamer, false = chat, null = draw or unknown
      gameOver: false, // Is the game over?

      // these are config options
      first: STREAMER, // First move: true = streamer, false = chat
      streamerMark: Mark.X, // Which mark streamer uses? true = X, false = O
      winnerCoordinates: [],
    };

    if (emptyState.first === STREAMER) {
      emptyState.turn = STREAMER;
    } else {
      emptyState.turn = CHAT;
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

  async webSocketMessage(ws: WebSocket, messageString: ArrayBuffer | string) {
    console.log('got a message:', messageString);

    if (typeof messageString === 'string') {
      const message = JSON.parse(messageString);

      // restart the game
      if (message.restart) {
        console.log('restart:', message.restart);

        this.state = this.getEmptyState();
        this.saveState();

        this.broadcaseState();
      }

      if (message.move) {
        console.log('move:', message.move);

        const [y, x] = message.move;

        // check if coordinates are valid
        if (x < 0 || x > 2 || y < 0 || y > 2) {
          console.log('invalid coordinates', x, y);
          return;
        }

        // figure out who is the player and which mark to use
        let mark: Mark;
        if (this.state.turn === STREAMER) {
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
        this.state.turn = !this.state.turn;

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
            this.state.winner = STREAMER;
          } else {
            this.state.winner = CHAT;
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

        this.saveState();

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
