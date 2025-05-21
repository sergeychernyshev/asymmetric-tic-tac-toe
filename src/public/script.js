// configuration settings
const STREAMER = true;
const CHAT = false;
const X = true;
const O = false;

// values of the state object
const XMark = 'X';
const OMark = 'O';

// CSS classes for the grid cells
const XClass = 'x';
const OClass = 'o';

function getTurnMark(state) {
  if (state.streamerMark === X) {
    return state.turn === X ? XMark : OMark;
  }

  if (state.streamerMark === O) {
    return state.turn === O ? OMark : XMark;
  }
}

let lastClientRender = null;

let state = {};

function setConnectionIndicator() {
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
    state = JSON.parse(event.data);
    console.log('Received game state from server:', state);

    // Convert the server's 2D board to our game format
    updateGameFromstate(state);
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

// This function converts the server state to the game's format and updates the UI
function updateGameFromstate(state) {
  if (!state || !state.board) return;

  // Clear UI
  document.querySelectorAll('.grid-cell').forEach((cell) => {
    cell.classList.remove('disabled', XClass, OClass);
  });

  // Update from server's board state In server: 0=empty, 1=X, 2=O
  const gridCells = document.querySelectorAll('.grid-cell');

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellValue = row * 3 + col;
      const cellState = state.board[row][col];

      if (cellState === XMark) {
        gridCells[cellValue].classList.add('disabled', XClass);
      } else if (cellState === OMark) {
        gridCells[cellValue].classList.add('disabled', OClass);
      }
    }
  }

  // Update turn
  if (state.gameOver) {
    document.querySelectorAll('.grid-cell').forEach((cell) => cell.classList.add('disabled'));
    document.querySelector('.game-over').classList.add('visible');
  }
}

const squares = document.querySelectorAll('.square');
const board = document.querySelector('.game-grid');

board.addEventListener('click', (e) => {
  const target = event.target;
  const isCell = target.classList.contains('grid-cell');
  const isDisabled = target.classList.contains('disabled');

  if (isCell && !isDisabled && currentWebSocket !== null) {
    const cellValueX = Number.parseInt(target.dataset.x);
    const cellValueY = Number.parseInt(target.dataset.y);
    currentWebSocket.send(JSON.stringify({ move: [cellValueX, cellValueY] }));

    // The player clicked on a cell that is still empty
    target.classList.add('disabled');
    target.classList.add(getTurnMark(state));
  }
});

document.querySelector('.restart').addEventListener('click', () => {
  currentWebSocket.send(JSON.stringify({ restart: true }));
  document.querySelector('.game-over').classList.remove('visible');
  document.querySelectorAll('.grid-cell').forEach((cell) => {
    cell.classList.remove('disabled', XClass, OClass);
  });
});
