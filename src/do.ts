import { DurableObject } from 'cloudflare:workers';

/** A Durable Object's behavior is defined in an exported Javascript class */
export class TicTacToeDO extends DurableObject<Env> {
  sql: SqlStorage;
  tableExists: boolean = false;
  state: any;

  /**
   * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
   * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
   *
   * @param ctx - The interface for interacting with Durable Object state
   * @param env - The interface to reference bindings declared in wrangler.jsonc
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.state = this.getInitialState();
    this.sql = ctx.storage.sql;

    if (!this.tableExists) {
      const result = this.sql.exec(`
            CREATE TABLE IF NOT EXISTS board (
                id		INTEGER PRIMARY KEY AUTOINCREMENT,
                message	TEXT
            );

        `);

      this.tableExists = true;

      console.log('CREATE TABLE result: ', result);
    }
  }

  private getInitialState() {
    return {
      board: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      turn: true, // Who's turn is it? true = streamer, false = chat
      started: false,
      winner: null, // who is the winner: true = streamer, false = chat, null = draw or unknown
      gameOver: false, // Is the game over?

      // these are config options
      first: true, // First move: true = streamer, false = chat
      mark: true, // Which mark streamer uses? true = X, false = O
    };
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

        this.state = this.getInitialState();

        this.broadcaseState();
      }

      if (message.move) {
        console.log('move:', message.move);

        // fix this if UI makes wrong moves
        const [y, x] = message.move;

        // check if coordinates are valid
        if (x < 0 || x > 2 || y < 0 || y > 2) {
          console.log('invalid coordinates', x, y);
          return;
        }

        // figure out who is the player and which mark to use
        let mark;
        if (this.state.turn) {
          // streamer made a move
          mark = this.state.mark ? 'X' : 'O';
        } else {
          // chat made a move
          mark = this.state.mark ? 'O' : 'X';
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
        let winner = null;
        // check rows
        for (let i = 0; i < 3; i++) {
          if (this.state.board[i][0] !== 'X' && this.state.board[i][0] !== 'O') {
            continue;
          }

          if (this.state.board[i][0] === this.state.board[i][1] && this.state.board[i][1] === this.state.board[i][2]) {
            over = true;
          }
        }
        // check columns
        for (let i = 0; i < 3; i++) {
          if (this.state.board[0][i] !== 'X' && this.state.board[0][i] !== 'O') {
            continue;
          }
          if (this.state.board[0][i] === this.state.board[1][i] && this.state.board[1][i] === this.state.board[2][i]) {
            over = true;
          }
        }
        // check diagonals
        if (this.state.board[1][1] === 'X' || this.state.board[1][1] === 'O') {
          if (this.state.board[0][0] === this.state.board[1][1] && this.state.board[1][1] === this.state.board[2][2]) {
            over = true;
          }
          if (this.state.board[0][2] === this.state.board[1][1] && this.state.board[1][1] === this.state.board[2][0]) {
            over = true;
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

        if (over) {
          this.state.gameOver = true;
        }

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
