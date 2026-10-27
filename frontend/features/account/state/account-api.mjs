export function createAccountAPI(fetcher = (...args) => fetch(...args)) {
  async function post(path, body, label) {
    const response = await fetcher(`/nickstats/api/auth/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.reason || `${label} failed with HTTP ${response.status}.`);
    return result;
  }
  return {
    async login({ username, password }) {
      username = username.trim();
      if (!username || !password) throw new Error('Enter your username and password.');
      return await post('login', { username, password }, 'Login') || { authenticated: true, username };
    },
    player(player) { return post('player', { player_id: player?.id ?? null }, 'Player update'); },
    password({ currentPassword, newPassword }) { return post('password', { current_password: currentPassword, new_password: newPassword }, 'Password change'); },
    logout() { return post('logout', undefined, 'Logout'); }
  };
}
