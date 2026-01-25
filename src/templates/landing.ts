import { UserProfile } from '../auth';

export function renderIndex(providers: { name: string; url: string; class: string }[], user: UserProfile | null): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tic-Tac-Toe</title>
    <link rel="stylesheet" href="styles.css" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <link rel="manifest" href="/manifest.json" />

    <link rel="icon" href="/x-favicon.png" />
    <link rel="apple-touch-icon" href="/x-favicon.png" />
  </head>

  <body>
    <nav>
      <div class="nav-content">
        <div class="nav-left">
          <a href="/" class="nav-brand">Tic-Tac-Toe</a>
        </div>
        <div class="nav-right">
          ${
            user
              ? `
        <div id="user-info" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
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
          <p style="margin: 0; display: flex; align-items: center; gap: 5px; font-size: 0.8rem;">
            <span id="user-name-display" style="font-weight: bold">${user.name}</span>
          </p>
          <a href="/auth/logout" class="logout-link" style="margin-left: 2px;" title="Logout"><span>Logout</span></a>
        </div>
          `
              : `
          <a href="#" class="login-link" onclick="document.getElementById('login-dialog').showModal(); return false;">Login</a>
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
    </nav>
    <section class="start-game">
      <h1>Tic-Tac-Toe</h1>


      <form class="join-game">
        <label for="game-id">Join Existing Game</label>
        <div class="input-group">
          <input type="text" id="game-id" name="game-id" placeholder="ABC-123" pattern="[A-Za-z]{3}-[0-9]{3}" required />
          <button type="submit">Join</button>
        </div>
      </form>

      <button class="start-button">Start New Game</button>
    </section>

    <script>
      const loginDialog = document.getElementById('login-dialog');
      if (loginDialog) {
        loginDialog.addEventListener('click', (e) => {
          if (e.target === loginDialog) {
            loginDialog.close();
          }
        });
      }

      function generateGameId() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 3; i++) {
          result += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        result += '-';
        // Ensure 3 digits
        let numbers = Math.floor(Math.random() * 1000).toString();
        while (numbers.length < 3) {
          numbers = '0' + numbers;
        }
        result += numbers;

        return result;
      }

      document.querySelector('.start-button').addEventListener('click', () => {
        const gameID = generateGameId();
        ${
          user
            ? `document.location.href = \`/\${gameID}/control\`;`
            : `document.location.href = \`/\${gameID}/control/\${self.crypto.randomUUID()}\`;`
        }
      });

      document.querySelector('.join-game').addEventListener('submit', (e) => {
        e.preventDefault();
        const gameId = document.getElementById('game-id').value.toUpperCase();
        if (gameId) {
          document.location.href = \`/\${gameId}\`;
        }
      });
    </script>
  </body>
</html>`;
}
