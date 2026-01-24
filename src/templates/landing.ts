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
    <section class="start-game">
      <h1>Tic-Tac-Toe</h1>

      ${
        user
          ? `
      <div id="user-info" style="margin-bottom: 20px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 10px;">
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
        <p style="margin: 0;">Welcome, <span id="user-name" style="font-weight: bold">${user.name}</span>!</p>
        <a href="/auth/logout" class="logout-link" style="margin-left: 10px;">Logout</a>
      </div>
      `
          : ''
      }

      <form class="join-game">
        <label for="game-id">Join Existing Game</label>
        <div class="input-group">
          <input type="text" id="game-id" name="game-id" placeholder="ABC-123" pattern="[A-Za-z]{3}-[0-9]{3}" required />
          <button type="submit">Join</button>
        </div>
      </form>

      <button class="start-button">Start New Game</button>

      ${
        !user && providers && providers.length > 0
          ? `
      <div class="divider">Or Login With</div>

      <div class="auth-section">
        <div class="login-buttons">
          ${providers.map((provider) => `<a href="${provider.url}" class="login-btn ${provider.class}">${provider.name}</a>`).join('\n')}
        </div>
      </div>
      `
          : ''
      }
    </section>

    <script>
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
