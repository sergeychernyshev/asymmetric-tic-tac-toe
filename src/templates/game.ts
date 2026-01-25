import { State, Mark, CHAT_TURN_TIME_MIN, CHAT_TURN_TIME_MAX } from '../do';
import { UserProfile } from '../auth';

export function renderGame(
  state: State,
  gameID: string,
  favicon: string,
  streamerTurnClass: string,
  chatTurnClass: string,
  chatLink: string,
  embedLink: string,
  streamerLink: string,
  streamerDisplayLink: string,
  isAuthorized: boolean,
  user: UserProfile | null,
  isEmbed: boolean,
  isControl: boolean,
  providers: { name: string; url: string; class: string }[],
): string {
  const getCellClass = (row: number, col: number) => {
    const val = state.board[row][col];
    if (val === Mark.X) return 'x disabled';
    if (val === Mark.O) return 'o disabled';
    return '';
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tic-Tac-Toe</title>
    <link rel="stylesheet" href="/styles.css" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <link rel="manifest" href="/manifest.json" />

    <link rel="icon" href="${favicon}" />
    <link rel="apple-touch-icon" href="/x-favicon.png" />

    <script>
      let state = ${JSON.stringify({ ...state, authorized: isAuthorized })};
    </script>
    <script src="/script.js" defer></script>
  </head>
  <body>
    ${
      !isEmbed
        ? `
    <nav>
      <div class="nav-content">
        <div class="nav-left">
          <a href="/" class="nav-brand">
            <img src="${favicon}" alt="" class="nav-icon" id="nav-icon" />
            Tic-Tac-Toe
          </a>
        </div>
        <div class="nav-right">
          ${
            user
              ? `
                <div id="user-info" class="user-info-container">
                  ${
                    user.picture
                      ? `
                  <div class="user-avatar-container">
                    <img src="${user.picture}" alt="${user.name}" class="avatar" />
                    <img src="https://www.google.com/s2/favicons?domain=${user.provider === 'twitch' ? 'twitch.tv' : user.provider === 'linkedin' ? 'linkedin.com' : 'google.com'}&sz=32" 
                          alt="${user.provider}" class="provider-icon" />
                  </div>`
                      : ''
                  }
                  <span id="user-name">${user.name}</span>
                  <a href="/auth/logout" class="logout-link" title="Logout"><span>Logout</span></a>
                </div>
                `
              : `          <a href="#" class="login-link" onclick="document.getElementById('login-dialog').showModal(); return false;">Login</a>
          <dialog id="login-dialog">
            <div class="login-dialog-content">
              <button onclick="document.getElementById('login-dialog').close()" class="close-dialog-x" aria-label="Close">&times;</button>
              <h3>Login</h3>
              <div class="login-buttons">
                ${providers.map((p) => `<a href="${p.url}" class="login-btn ${p.class}">${p.name}</a>`).join('')}
              </div>
            </div>
          </dialog>
          `
          }
        </div>
      </div>
    </nav>`
        : ''
    }
    <main>
      <section class="game-wrapper">
        <div class="game-board">
          <div class="turn-status">
            <span class="streamer player ${streamerTurnClass}"></span>
            <div class="turn-progress">
              <span class="turn-message"></span>
              <div class="progress-circle hide">
                <span class="number"></span>
                <svg>
                  <circle class="bg" cx="30" cy="30" r="25"></circle>
                  <circle class="progress" cx="30" cy="30" r="25"></circle>
                </svg>
              </div>
            </div>
            <span class="chat player ${chatTurnClass}"></span>
          </div>
          <div class="game-grid">
            <button title="top-left square" class="grid-cell ${getCellClass(0, 0)}" data-x="0" data-y="0"></button>
            <button title="top-center square" class="grid-cell ${getCellClass(0, 1)}" data-x="1" data-y="0"></button>
            <button title="top-right square" class="grid-cell ${getCellClass(0, 2)}" data-x="2" data-y="0"></button>
            <button title="middle-left square" class="grid-cell ${getCellClass(1, 0)}" data-x="0" data-y="1"></button>
            <button title="middle-center square" class="grid-cell ${getCellClass(1, 1)}" data-x="1" data-y="1"></button>
            <button title="middle-right square" class="grid-cell ${getCellClass(1, 2)}" data-x="2" data-y="1"></button>
            <button title="bottom-left square" class="grid-cell ${getCellClass(2, 0)}" data-x="0" data-y="2"></button>
            <button title="bottom-center square" class="grid-cell ${getCellClass(2, 1)}" data-x="1" data-y="2"></button>
            <button title="bottom-right square" class="grid-cell ${getCellClass(2, 2)}" data-x="2" data-y="2"></button>
          </div>
        </div>
        <div class="sync hide">Please wait for you turn to sync...</div>
      </section>
      ${
        user && !isControl && !isEmbed && state.owner === user.id
          ? `<a href="/${gameID}/control" title="Go to Control Panel" class="game-control-gear-large">⚙️</a>`
          : ''
      }
      <div>
        ${
          isAuthorized
            ? `
        <section class="share">
          Share/Invite:
          <a id="chat-link" href="${chatLink}" target="_blank" rel="noopener noreferrer"><span id="game-id-display">${gameID}</span></a>
          <button class="copy-btn" data-target="chat-link" aria-label="Copy Chat Link" title="Click to copy URL">📋</button>
        </section>

        <section class="settings">
          <button class="restart" disabled>Restart Game</button>

          <h2>Settings</h2>
          <form>
            <fieldset class="radio-group">
              <legend>First move</legend>

              <label>
                <input type="radio" name="first-move" value="streamer" ${state.settings.first === 'streamer' ? 'checked' : ''} />
                Streamer
              </label>
              <label>
                <input type="radio" name="first-move" value="chat" ${state.settings.first === 'chat' ? 'checked' : ''} />
                Chat
              </label>
            </fieldset>

            <fieldset class="radio-group small">
              <legend>Streamer's mark</legend>

              <label>
                <input type="radio" name="streamer-mark" value="X" ${state.settings.streamerMark === 'X' ? 'checked' : ''} />
                X
              </label>

              <label>
                <input type="radio" name="streamer-mark" value="O" ${state.settings.streamerMark === 'O' ? 'checked' : ''} />
                O
              </label>
            </fieldset>

            <fieldset class="radio-group">
              <legend>Mode</legend>

              <label>
                <input type="radio" name="mode" value="regular" ${state.settings.mode === 'regular' ? 'checked' : ''} />
                Regular
              </label>

              <label>
                <input type="radio" name="mode" value="vote" ${state.settings.mode === 'vote' ? 'checked' : ''} />
                Vote
              </label>
            </fieldset>

            <label class="time-for-chat mode-specific mode-vote">
              Time for chat's turn (sec)
              <input type="number" name="chat-turn-time" value="${state.settings.chatTurnTime}" min="${CHAT_TURN_TIME_MIN}" max="${CHAT_TURN_TIME_MAX}" />
            </label>

            <label class="games-per-round">
              Games per round
              <input type="number" name="games-per-round" value="${state.settings.gamesPerRound}" />
            </label>

            <button class="save" disabled>Save Settings</button>
          </form>
        </section>
        `
            : ''
        }
      </div>
    </main>
    ${
      isAuthorized
        ? `
    <section class="links-panel">
      <div>
        <strong>Embed:</strong> <a id="embed-link" href="${embedLink}" target="_blank" rel="noopener noreferrer">${embedLink}</a>
        <button class="copy-btn" data-target="embed-link" aria-label="Copy Embed Link" title="Click to copy URL">📋</button>
      </div>
      <div>
        <strong>Streamer Control:</strong>
        <a id="streamer-link" href="${streamerLink}" target="_blank" rel="noopener noreferrer">${streamerDisplayLink}</a>
        <button class="copy-btn" data-target="streamer-link" aria-label="Copy Streamer Link" title="Click to copy URL">📋</button>
      </div>
    </section>
    `
        : ''
    }
    <dialog id="confirm-move-dialog">
      <div class="dialog-content">
        <h3>Confirm Move</h3>
        <p>Are you sure you want to make a move for the chat?</p>
        <div class="dialog-buttons">
          <button id="confirm-move-yes" class="btn-primary">Yes</button>
          <button id="confirm-move-no" class="btn-secondary">No</button>
        </div>
      </div>
    </dialog>
  </body>
</html>`;
}
