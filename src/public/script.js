// configuration settings
const STREAMER = 'streamer';
const CHAT = 'chat';

// values of the state object
const XMark = 'X';
const OMark = 'O';

// CSS classes for the grid cells
const XClass = 'x';
const OClass = 'o';
const TurnClass = 'turn';
const WinnerClass = 'winner';
const VisibleClass = 'visible';
const HideClass = 'hide';

// DOM elements
const favicon = document.querySelector("link[rel='icon']");
const streamer = document.querySelector('.streamer');
const chat = document.querySelector('.chat');
const gridCells = document.querySelectorAll('.grid-cell');
const squares = document.querySelectorAll('.square');
const board = document.querySelector('.game-grid');
const restart = document.querySelector('.restart');
const player = document.querySelectorAll('.player');
const sync = document.querySelector('.sync');
const settings = document.querySelector('.settings');
const save = document.querySelector('.save');
const settingsForm = document.querySelector('.settings form');

// disable UI till next data is received
let disableUI = false;

function getTurnMark(state) {
  if (state.settings.streamerMark === XMark) {
    return state.turn === STREAMER ? XMark : OMark;
  }

  if (state.settings.streamerMark === OMark) {
    return state.turn === CHAT ? XMark : OMark;
  }
}

function sendMessage(messageObject) {
  if (currentWebSocket) {
    currentWebSocket.send(JSON.stringify(messageObject));
  } else {
    console.error('WebSocket is not connected');
  }
}

function setConnectionIndicator() {
  console.log(currentWebSocket ? 'Connected 🟢' : 'Disconnected 🔴');
}

let currentWebSocket = null;

function join() {
  // If we are running via wrangler dev, use ws:
  const wss = document.location.protocol === 'http:' ? 'ws://' : 'wss://';
  let ws = new WebSocket(`${wss}${window.location.hostname}:${window.location.port}/websocket${window.location.search}`);
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
    sendMessage({ connected: true });
  });

  // receive a message
  ws.addEventListener('message', (event) => {
    state = JSON.parse(event.data);
    // console.log('Received game state from server:', state);

    // Convert the server's 2D board to our game format
    updateGameFromstate(state);
    disableUI = false;
    sync.classList.add(HideClass);
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

  streamer.classList.remove(XClass, OClass, TurnClass);
  chat.classList.remove(XClass, OClass, TurnClass);

  if (state.settings.streamerMark === XMark) {
    streamer.classList.add(XClass);
    chat.classList.add(OClass);
  } else {
    streamer.classList.add(OClass);
    chat.classList.add(XClass);
  }

  if (state.turn === STREAMER) {
    streamer.classList.add(TurnClass);
  } else {
    chat.classList.add(TurnClass);
  }

  if (getTurnMark(state) === XMark) {
    favicon.href = '/x-favicon.png';
  } else {
    favicon.href = '/o-favicon.png';
  }

  // Clear UI
  gridCells.forEach((cell) => {
    cell.classList.remove(XClass, OClass, WinnerClass);
    cell.disabled = false;
  });

  // Update from server's board state In server: 0=empty, 1=X, 2=O
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      const cellState = state.board[row][col];

      if (cellState === XMark) {
        gridCells[cellIndex].classList.add(XClass);
        gridCells[cellIndex].disabled = true;
      } else if (cellState === OMark) {
        gridCells[cellIndex].classList.add(OClass);
        gridCells[cellIndex].disabled = true;
      }
    }
  }

  // Update turn
  if (state.gameOver) {
    gridCells.forEach((cell) => (cell.disabled = true));
    restart.disabled = false;
    restart.focus();

    if (state.winner === STREAMER) {
      streamer.classList.add(WinnerClass);
    }
    if (state.winner === CHAT) {
      chat.classList.add(WinnerClass);
    }

    state.winnerCoordinates.forEach((cell) => {
      gridCells[cell[0] * 3 + cell[1]].classList.add(WinnerClass);
    });
  } else {
    restart.disabled = true;
    streamer.classList.remove(WinnerClass);
    chat.classList.remove(WinnerClass);
  }

  if (state.authorized) {
    settings.classList.add(VisibleClass);

    new FormData(settingsForm);
  } else {
    settings.classList.remove(VisibleClass);
  }
}

board.addEventListener('click', (e) => {
  if (disableUI) {
    sync.classList.remove(HideClass);
    return;
  }

  const target = event.target;
  const isCell = target.classList.contains('grid-cell');

  if (isCell && currentWebSocket !== null) {
    const cellValueX = Number.parseInt(target.dataset.x);
    const cellValueY = Number.parseInt(target.dataset.y);
    disableUI = true;
    sendMessage({ move: [cellValueX, cellValueY] });

    // The player clicked on a cell that is still empty
    target.disabled = true;
    target.classList.add(getTurnMark(state) === XMark ? XClass : OClass);

    player.forEach((cell) => {
      cell.classList.remove(TurnClass);
    });
  }
});

restart.addEventListener('click', () => {
  sendMessage({ restart: true });
  restart.disabled = true;
  gridCells.forEach((cell) => {
    cell.classList.remove(XClass, OClass, WinnerClass);
    cell.disabled = false;
  });
  player.forEach((cell) => {
    cell.classList.remove(WinnerClass, TurnClass);
  });
});

function settingsChaned() {
  save.disabled = false;
}

function saveSettings(e) {
  e.preventDefault();

  const formData = new FormData(settingsForm);
  const settings = {
    streamerMark: formData.get('streamer-mark'),
    first: formData.get('first-move'),
    gamesPerRound: Number.parseInt(formData.get('games-per-round')),
    chatTurnTime: Number.parseInt(formData.get('chat-turn-time')),
  };

  sendMessage({ settings });

  save.disabled = true;
}

save.addEventListener('click', saveSettings);
settingsForm.addEventListener('submit', saveSettings);
settingsForm.addEventListener('change', settingsChaned);
