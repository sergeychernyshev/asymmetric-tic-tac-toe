console.log('hello, tic-tac-toe is here in your console!');

let lastClientRender = null;

let state = {};

function setConnectionIndicator() {
  //   socketIndicator.innerText = currentWebSocket ? 'Connected 🟢' : 'Disconnected 🔴';
  console.log(currentWebSocket ? 'Connected 🟢' : 'Disconnected 🔴');
}

async function render() {
  lastClientRender = Date.now();
  console.log('Rendering...');
}

let currentWebSocket = null;

function join() {
  // If we are running via wrangler dev, use ws:
  const wss = document.location.protocol === 'http:' ? 'ws://' : 'wss://';
  let ws = new WebSocket(`${wss}${window.location.hostname}:${window.location.port}/websocket`);
  let rejoined = false;
  let startTime = Date.now();

  let rejoin = async () => {
    if (!rejoined) {
      rejoined = true;
      currentWebSocket = null;
      setConnectionIndicator();

      // Don't try to reconnect too rapidly.
      let timeSinceLastJoin = Date.now() - startTime;
      if (timeSinceLastJoin < 10000) {
        // Less than 10 seconds elapsed since last join. Pause a bit.
        await new Promise((resolve) => setTimeout(resolve, 10000 - timeSinceLastJoin));
      }

      // OK, reconnect now!
      join();
    }
  };

  ws.addEventListener('open', (event) => {
    currentWebSocket = ws;
    setConnectionIndicator();

    // Send user info message. use this to send a message.
    ws.send(JSON.stringify({ connected: true }));
  });

  // receive a message
  ws.addEventListener('message', (event) => {
    let serverState = JSON.parse(event.data);
    console.log('Received game state from server:', serverState);

    // Convert the server's 2D board to our game format
    updateGameFromServerState(serverState);
  });

  ws.addEventListener('close', (event) => {
    console.log('WebSocket closed, reconnecting:', event.code, event.reason);

    rejoin();
  });

  ws.addEventListener('error', (event) => {
    console.log('WebSocket error, reconnecting:', event);
    rejoin();
  });
}
join();

const game = {
  xTurn: true,
  xState: [],
  oState: [],
  winningStates: [
    // Rows
    ['0', '1', '2'],
    ['3', '4', '5'],
    ['6', '7', '8'],

    // Columns
    ['0', '3', '6'],
    ['1', '4', '7'],
    ['2', '5', '8'],

    // Diagonal
    ['0', '4', '8'],
    ['2', '4', '6'],
  ],
};

// This function converts the server state to the game's format and updates the UI
function updateGameFromServerState(serverState) {
  if (!serverState || !serverState.board) return;

  // Clear previous game state
  game.xState = [];
  game.oState = [];

  // Clear UI
  document.querySelectorAll('.grid-cell').forEach((cell) => {
    cell.classList.remove('disabled', 'x', 'o');
  });

  // Update from server's board state In server: 0=empty, 1=X, 2=O
  const gridCells = document.querySelectorAll('.grid-cell');

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellValue = row * 3 + col;
      const cellState = serverState.board[row][col];

      if (cellState === 1) {
        // X
        game.xState.push(String(cellValue));
        gridCells[cellValue].classList.add('disabled', 'x');
      } else if (cellState === 2) {
        // O
        game.oState.push(String(cellValue));
        gridCells[cellValue].classList.add('disabled', 'o');
      }
    }
  }

  // Update turn
  game.xTurn = serverState.turn === serverState.mark;
}

const squares = document.querySelectorAll('.square');
const board = document.querySelector('.game-grid');

board.addEventListener('click', (e) => {
  console.log('righthere!', e.target.classList);

  const target = event.target;
  const isCell = target.classList.contains('grid-cell');
  const isDisabled = target.classList.contains('disabled');

  if (isCell && !isDisabled && currentWebSocket !== null) {
    // currentWebSocket.send(JSON.stringify({ move: [0,0]}));
    const cellValueX = Number.parseInt(target.dataset.x);
    const cellValueY = Number.parseInt(target.dataset.y);
    currentWebSocket.send(JSON.stringify({ move: [cellValueX, cellValueY] }));
    // The player clicked on a cell that is still empty

    // game.xTurn === true ? game.xState.push(cellValue) : game.oState.push(cellValue);

    target.classList.add('disabled');
    target.classList.add(game.xTurn ? 'x' : 'o');

    game.xTurn = !game.xTurn;

    if (!document.querySelectorAll('.grid-cell:not(.disabled)').length) {
      document.querySelector('.game-over').classList.add('visible');
      document.querySelector('.game-over-text').textContent = 'Draw!';
    }
    game.winningStates.forEach((winningState) => {
      const xWins = winningState.every((state) => game.xState.includes(state));
      const oWins = winningState.every((state) => game.oState.includes(state));

      if (xWins || oWins) {
        document.querySelectorAll('.grid-cell').forEach((cell) => cell.classList.add('disabled'));
        document.querySelector('.game-over').classList.add('visible');
        document.querySelector('.game-over-text').textContent = xWins ? 'X wins!' : 'O wins!';
      }
    });
  }
});

document.querySelector('.restart').addEventListener('click', () => {
  document.querySelector('.game-over').classList.remove('visible');
  document.querySelectorAll('.grid-cell').forEach((cell) => {
    cell.classList.remove('disabled', 'x', 'o');
  });

  game.xTurn = true;
  game.xState = [];
  game.oState = [];
});
