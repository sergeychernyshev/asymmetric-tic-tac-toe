import { UserProfile } from '../auth';

export function renderIndex(
  providers: { name: string; url: string; class: string }[],
  user: UserProfile | null,
  games: any[] = [],
): string {
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
          <a href="/" class="nav-brand">
            <img src="/x-favicon.png" alt="" class="nav-icon" />
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
              : ''
          }
        </div>
      </div>
    </nav>
    <section class="start-game">
      <h1>Tic-Tac-Toe</h1>


      <form class="join-game">
        <label for="game-id">Join Existing Game</label>
        <div class="input-group">
          <input type="text" id="game-id" name="game-id" placeholder="ABC-123" pattern="[A-Za-z]{3}[ -]*[0-9]{3}" required />
          <button type="submit">Join</button>
        </div>
      </form>

      <button class="start-button">Start New Game</button>

      ${
        user && games && games.length > 0
          ? (() => {
              const ownedGames = games.filter((g) => g.role === 'owner');
              const playedGames = games.filter((g) => g.role === 'player');
              return `
      <section class="recent-games">
        ${
          ownedGames.length > 0
            ? `
        <div class="divider">Your Games</div>
        <ul class="games-list">
          ${ownedGames
            .map(
              (game) => `
          <li class="game-item">
            <a href="/${game.gameId}/control" class="game-link">
              <span class="game-id">${game.gameId}</span>
              <span class="game-role owner" title="You are the owner of this game">👑</span>
              <time class="game-date" datetime="${new Date(game.timestamp).toISOString()}">${new Date(
                game.timestamp,
              ).toLocaleDateString()}</time>
            </a>
            <button class="delete-game-btn" data-game-id="${game.gameId}" aria-label="Delete game" title="Remove from list">🗑️</button>
          </li>`,
            )
            .join('')}
        </ul>`
            : ''
        }

        ${
          playedGames.length > 0
            ? `
        <div class="divider">Games You Joined</div>
        <ul class="games-list">
          ${playedGames
            .map(
              (game) => `
          <li class="game-item">
            <a href="/${game.gameId}" class="game-link">
              <span class="game-id">${game.gameId}</span>
              <span class="game-role player"></span>
              <time class="game-date" datetime="${new Date(game.timestamp).toISOString()}">${new Date(
                game.timestamp,
              ).toLocaleDateString()}</time>
            </a>
            <div class="delete-game-placeholder"></div>
          </li>`,
            )
            .join('')}
        </ul>`
            : ''
        }
      </section>
      `;
            })()
          : ''
      }

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

    <dialog id="delete-game-dialog">
      <div class="dialog-content">
        <h3>Delete Game?</h3>
        <p>Are you sure you want to remove this game from your list?</p>
        <div class="dialog-buttons">
          <button id="delete-game-yes" class="btn-primary">Yes, Delete</button>
          <button id="delete-game-no" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </dialog>

    <script>
      const loginDialog = document.getElementById('login-dialog');
      if (loginDialog) {
        loginDialog.addEventListener('click', (e) => {
          if (e.target === loginDialog) {
            loginDialog.close();
          }
        });
      }

      // Format dates
      document.querySelectorAll('time.game-date').forEach(time => {
        const date = new Date(time.getAttribute('datetime'));
        time.textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      });

      // Delete game logic
      const deleteDialog = document.getElementById('delete-game-dialog');
      const deleteYesBtn = document.getElementById('delete-game-yes');
      const deleteNoBtn = document.getElementById('delete-game-no');
      let gameToDelete = null;

      if (deleteDialog) {
        deleteDialog.addEventListener('click', (e) => {
          if (e.target === deleteDialog) {
            deleteDialog.close();
          }
        });

        document.querySelectorAll('.delete-game-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent affecting parent elements
            gameToDelete = btn.dataset.gameId;
            deleteDialog.showModal();
          });
        });

        deleteYesBtn.addEventListener('click', async () => {
          if (gameToDelete) {
             const res = await fetch('/api/games/delete', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ gameId: gameToDelete })
             });
             
             if (res.ok) {
               window.location.reload();
             } else {
               alert('Failed to delete game');
             }
          }
          deleteDialog.close();
          gameToDelete = null;
        });

        deleteNoBtn.addEventListener('click', () => {
           deleteDialog.close();
           gameToDelete = null;
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
        const input = document.getElementById('game-id').value.toUpperCase().trim();
        // Extract 3 letters and 3 digits, ignoring delimiters
        const match = input.match(/^([A-Z]{3})[ -]*([0-9]{3})$/);
        
        if (match) {
          const gameId = \`\${match[1]}-\${match[2]}\`;
          document.location.href = \`/\${gameId}\`;
        }
      });
    </script>
  </body>
</html>`;
}
