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
const HideClass = 'hide';

// DOM elements
const favicon = document.querySelector("link[rel='icon']");
const streamer = document.querySelector('.streamer');
const chat = document.querySelector('.chat');
const turnMessage = document.querySelector('.turn-message');
const progressCircle = document.querySelector('.progress-circle');
const progressNumber = document.querySelector('.progress-circle .number');
const progressRing = document.querySelector('.progress-circle .progress');
const gridCells = document.querySelectorAll('.grid-cell');
const squares = document.querySelectorAll('.square');
const board = document.querySelector('.game-grid');
const restart = document.querySelector('.restart');
const player = document.querySelectorAll('.player');
const sync = document.querySelector('.sync');
const settingsPanel = document.querySelector('.settings');
const saveButton = document.querySelector('.save');
const settingsForm = document.querySelector('.settings form');
const modeRadioButtons = document.querySelectorAll('input[name="mode"]');
const modeSpecificSettings = document.querySelectorAll('.mode-specific');
const chatTurnTimeInput = document.querySelector('input[name="chat-turn-time"]');

// disable UI till next data is received
let disableUI = false;
const isEmbedded = new URLSearchParams(window.location.search).get('embed') === 'true';
let timerInterval = null;

// Function to update visibility of mode-specific settings
function updateModeSpecificSettingsVisibility() {
  const selectedMode = document.querySelector('input[name="mode"]:checked').value;
  modeSpecificSettings.forEach((element) => {
    if (element.classList.contains(`mode-${selectedMode}`)) {
      element.style.display = 'flex';
    } else {
      element.style.display = 'none';
    }
  });
}

// Call on load
if (settingsPanel) {
  updateModeSpecificSettingsVisibility();
}

// Copy button event listeners
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      let textToCopy;
      if (targetElement.tagName === 'A') {
        textToCopy = targetElement.href;
      } else if (targetElement.tagName === 'SPAN') {
        textToCopy = targetElement.textContent;
      }

      if (textToCopy) {
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            const originalText = btn.textContent;
            btn.textContent = '✅';

            // Create popover
            const popover = document.createElement('span');
            popover.textContent = 'Copied!';
            popover.className = 'copy-popover';
            btn.appendChild(popover);

            // Remove after 2 seconds
            setTimeout(() => {
              btn.textContent = originalText; // Revert button text
              popover.remove();
            }, 2000);
          })
          .catch((err) => {
            console.error('Failed to copy: ', err);
          });
      }
    }
  });
});

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
  let wsUrl = `${wss}${window.location.hostname}:${window.location.port}/websocket${window.location.search}`;
  
  const sessionId = localStorage.getItem('sessionId');
  if (sessionId) {
    // Append sessionId to URL. Check if it already has params.
    const separator = wsUrl.includes('?') ? '&' : '?';
    wsUrl += `${separator}sessionId=${sessionId}`;
  }

  let ws = new WebSocket(wsUrl);
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

    if (state.sessionId) {
      localStorage.setItem('sessionId', state.sessionId);
    }

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

  // Clear any existing timer
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

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
    cell.classList.remove(XClass, OClass, WinnerClass, 'vote-mark');
    cell.style.removeProperty('--vote-opacity');
    cell.disabled = false;
    // Store original title if not already stored
    if (!cell.hasAttribute('data-original-title')) {
      cell.setAttribute('data-original-title', cell.title);
    }
    // Restore original title when re-enabling
    cell.title = cell.getAttribute('data-original-title');

    // Remove any existing vote count display
    const voteCount = cell.querySelector('.vote-count');
    if (voteCount) {
      voteCount.remove();
    }
  });

  // Determine if empty cells should be disabled for unauthenticated players when it's not their turn
  const shouldDisableAllEmptyCells = !state.authorized && state.turn === STREAMER;

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
      } else if (shouldDisableAllEmptyCells) {
        gridCells[cellIndex].disabled = true;
        // Append wait message to tooltip
        const originalTitle = gridCells[cellIndex].getAttribute('data-original-title');
        gridCells[cellIndex].title = `${originalTitle} - Wait for opponent's turn`;
      }
    }
  }

  // Display votes if in vote mode and it's chat's turn
  if (state.settings.mode === 'vote' && state.turn === CHAT && state.votes && state.votes.length > 0) {
    const voteCounts = {};
    let maxVotes = 0;

    state.votes.forEach((vote) => {
      // vote is [col, row] (y, x) from server message.move
      // But let's verify: in DO applyMove(x, y) where x=row, y=col.
      // wait, in DO: const [y, x] = message.move; ... votes.push([y, x]);
      // message.move comes from client: sendMessage({ move: [cellValueX, cellValueY] });
      // client dataset.x is column index (0,1,2), dataset.y is row index (0,1,2).
      // So message.move is [col, row].
      // So vote[0] is col, vote[1] is row.
      const col = vote[0];
      const row = vote[1];
      const key = `${row},${col}`;
      voteCounts[key] = (voteCounts[key] || 0) + 1;
      maxVotes = Math.max(maxVotes, voteCounts[key]);
    });

    Object.keys(voteCounts).forEach((key) => {
      const [row, col] = key.split(',').map(Number);
      const cellIndex = row * 3 + col;
      const cell = gridCells[cellIndex];

      // Only show votes on empty cells
      if (!cell.classList.contains(XClass) && !cell.classList.contains(OClass)) {
        cell.classList.add('vote-mark');
        // Add class for the mark being voted for (Streamer's opponent mark)
        const voteMark = state.settings.streamerMark === XMark ? OClass : XClass;
        cell.classList.add(voteMark);

        // Calculate opacity based on vote count relative to max votes
        // Min opacity 0.2, Max 0.8
        const opacity = 0.2 + (voteCounts[key] / maxVotes) * 0.4;
        cell.style.setProperty('--vote-opacity', opacity);

        // Display vote count
        const countSpan = document.createElement('span');
        countSpan.className = 'vote-count';
        countSpan.textContent = voteCounts[key];
        cell.appendChild(countSpan);
      }
    });
  }

  // Update turn
  if (state.gameOver) {
    turnMessage.textContent = 'Game Over';
    progressCircle.classList.add(HideClass);
    gridCells.forEach((cell) => (cell.disabled = true));

    if (settingsPanel) {
      restart.disabled = false;
      restart.focus();
    }

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
    if (isEmbedded) {
      turnMessage.textContent = '';
    } else {
      const isMyTurn = (state.authorized && state.turn === STREAMER) || (!state.authorized && state.turn === CHAT);
      if (isMyTurn) {
        turnMessage.textContent = "It's your turn!";
      } else {
        turnMessage.textContent = '⏳ Wait for your turn...';
      }
    }

    // Vote mode timer
    if (state.settings.mode === 'vote' && state.turn === CHAT && state.voteEndTime) {
      progressCircle.classList.remove(HideClass);
      const updateTimer = () => {
        const now = Date.now();
        const remainingTime = Math.max(0, Math.ceil((state.voteEndTime - now) / 1000));
        const totalTime = state.settings.chatTurnTime;

                  if (remainingTime > 0) {
                    turnMessage.textContent = ``;
        
                    progressNumber.textContent = remainingTime;
                    if (remainingTime.toString().length >= 3) {
                      progressNumber.classList.add('small-font');
                    } else {
                      progressNumber.classList.remove('small-font');
                    }
                  // Calculate progress offset
          // Circumference is ~157
          // Offset = Circumference * (1 - remaining / total)
          // But we want it to shrink, so we want the DASH to shrink?
          // dasharray 157.
          // offset 0 = full circle.
          // offset 157 = empty circle.
          // We want it to go from Full (0) to Empty (157).
          // So offset = 157 * (1 - remaining / total).
          const offset = 157 * (1 - remainingTime / totalTime);
          progressRing.style.strokeDashoffset = offset;
        } else {
          turnMessage.textContent = 'Voting ended!';
          progressCircle.classList.add(HideClass);
          clearInterval(timerInterval);
          timerInterval = null;
        }
      };
      updateTimer(); // Initial call
      timerInterval = setInterval(updateTimer, 1000);
    } else {
      progressCircle.classList.add(HideClass);
    }

    if (settingsPanel) {
      restart.disabled = true;
    }
    streamer.classList.remove(WinnerClass);
    chat.classList.remove(WinnerClass);
  }
}

if (!isEmbedded) {
  board.addEventListener('click', (e) => {
    // If the user is not authorized and it's not the chat's turn, do nothing.
    if (!state.authorized && state.turn !== CHAT) {
      return;
    }

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

  if (settingsPanel) {
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
  }
}

function settingsChanged() {
  saveButton.disabled = false;
}

function saveSettings(e) {
  e.preventDefault();

  const formData = new FormData(settingsForm);
  let chatTurnTime = Number.parseInt(formData.get('chat-turn-time'));
  const minTime = Number.parseInt(chatTurnTimeInput.min);
  const maxTime = Number.parseInt(chatTurnTimeInput.max);

  // Enforce min/max for chatTurnTime
  chatTurnTime = Math.max(minTime, Math.min(maxTime, chatTurnTime));

  const settings = {
    streamerMark: formData.get('streamer-mark'),
    first: formData.get('first-move'),
    gamesPerRound: Number.parseInt(formData.get('games-per-round')),
    chatTurnTime,
    mode: formData.get('mode'),
  };

  sendMessage({ settings });

  saveButton.disabled = true;
}

if (settingsPanel) {
  saveButton.addEventListener('click', saveSettings);
  settingsForm.addEventListener('submit', saveSettings);
  settingsForm.addEventListener('change', settingsChanged);
  modeRadioButtons.forEach((radio) => {
    radio.addEventListener('change', updateModeSpecificSettingsVisibility);
  });

  if (chatTurnTimeInput) {
    chatTurnTimeInput.addEventListener('input', (e) => {
      let value = Number.parseInt(e.target.value);
      const minTime = Number.parseInt(e.target.min);
      const maxTime = Number.parseInt(e.target.max);

      if (isNaN(value)) {
        value = minTime; // Default to min if input is not a number
      }
      e.target.value = Math.max(minTime, Math.min(maxTime, value));
      settingsChanged(); // Also trigger settingsChanged so save button is enabled
    });
  }
}
