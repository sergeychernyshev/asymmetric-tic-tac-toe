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

    // Send user info message.
    ws.send(JSON.stringify({ connected: true }));
  });

  ws.addEventListener('message', (event) => {
    let message = JSON.parse(event.data);
    console.log('Received message: ', message);
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
const form = document.querySelector('form');
const input = document.querySelector('input');
const clear = document.querySelector('#clear');

clear.addEventListener('click', async (e) => {
  if (!currentWebSocket) {
    return false;
  }

  e.preventDefault();

  currentWebSocket.send(JSON.stringify({ clear: true }));
});

form.addEventListener('submit', async (e) => {
  if (!currentWebSocket) {
    return false;
  }

  e.preventDefault();

  const payload = new FormData(form).entries().reduce((data, entry) => {
    data[entry[0]] = entry[1];

    return data;
  }, {});

  currentWebSocket.send(JSON.stringify(payload));

  input.value = '';

  renderChat();
});

let lastClientRender = null;

let chat = [];

function setConnectionIndicator() {
  socketIndicator.innerText = currentWebSocket ? 'Connected 🟢' : 'Disconnected 🔴';
}

const lastUpdateIndicator = document.querySelector('#last-update');
setInterval(() => {
  if (lastClientRender) {
    setConnectionIndicator();
    lastUpdateIndicator.innerText = `Last updated ${Math.floor((Date.now() - lastClientRender) / 1000)} seconds ago`;
  }
}, 1000);

async function renderChat() {
  lastClientRender = Date.now();
  document.querySelector('#chat').innerHTML = chat.map((message) => `<div>${message}</div>`).join('\n');
}

const socketIndicator = document.querySelector('#socket');
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

    // Send user info message.
    ws.send(JSON.stringify({ connected: true }));
  });

  ws.addEventListener('message', (event) => {
    let message = JSON.parse(event.data);
    // console.log('Received message: ', message);

    if (message.message) {
      chat.push(message.message);
      renderChat();
    }

    if (message.chat) {
      chat = message.chat;
      renderChat();
    }
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

const squares = document.querySelectorAll('.square');
const board = document.querySelector('.game-grid');

board.addEventListener('click', (e) => {
  console.log(e.target.classList);
  const target = event.target;
  const isCell = target.classList.contains('grid-cell');
  const isDisabled = target.classList.contains('disabled');

  if (isCell && !isDisabled) {
    // The player clicked on a cell that is still empty
    const cellValue = target.dataset.value;

    game.xTurn === true ? game.xState.push(cellValue) : game.oState.push(cellValue);

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

// const socketIndicator = document.querySelector('#socket');
// let currentWebSocket = null;
// function join() {
//   // If we are running via wrangler dev, use ws:
//   const wss = document.location.protocol === 'http:' ? 'ws://' : 'wss://';
//   let ws = new WebSocket(`${wss}${window.location.hostname}:${window.location.port}/websocket`);
//   let rejoined = false;
//   let startTime = Date.now();

//   let rejoin = async () => {
//     if (!rejoined) {
//       rejoined = true;
//       currentWebSocket = null;
//       setConnectionIndicator();

//       // Don't try to reconnect too rapidly.
//       let timeSinceLastJoin = Date.now() - startTime;
//       if (timeSinceLastJoin < 10000) {
//         // Less than 10 seconds elapsed since last join. Pause a bit.
//         await new Promise((resolve) => setTimeout(resolve, 10000 - timeSinceLastJoin));
//       }

//       // OK, reconnect now!
//       join();
//     }
//   };

//   ws.addEventListener('open', (event) => {
//     currentWebSocket = ws;
//     setConnectionIndicator();

//     // Send user info message.
//     ws.send(JSON.stringify({ connected: true }));
//   });

//   ws.addEventListener('message', (event) => {
//     let message = JSON.parse(event.data);
//     // console.log('Received message: ', message);

//     if (message.message) {
//       chat.push(message.message);
//       renderChat();
//     }

//     if (message.chat) {
//       chat = message.chat;
//       renderChat();
//     }
//   });

//   ws.addEventListener('close', (event) => {
//     console.log('WebSocket closed, reconnecting:', event.code, event.reason);

//     rejoin();
//   });

//   ws.addEventListener('error', (event) => {
//     console.log('WebSocket error, reconnecting:', event);
//     rejoin();
//   });
// }
// join();
