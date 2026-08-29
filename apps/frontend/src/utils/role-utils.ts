type UserRole = 'admin' | 'event' | 'guest' | null;

// Client-only heuristic for deciding what the UI *shows* — trivially
// spoofable via localStorage/devtools, so it must never be relied on to
// decide what the backend *allows*. Actual enforcement belongs in Hasura
// permissions keyed off the verified Firebase session, not here.
// See docs/ROLE_ACCESS_CONTROL_AUDIT.md for the full audit and the
// split-responsibility model every role-gated feature must follow.
export function getUserRole(): UserRole {
  const storedAddress = localStorage.getItem('address-wallet');
  
  if (!storedAddress) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedAddress);
    const address = typeof parsed === 'string' ? parsed : parsed?.address;

    if (!address || typeof address !== 'string') {
      return null;
    }

    if (address.startsWith('0xadmin') || address.includes('admin')) {
      return 'admin';
    } else if (address.startsWith('0xhotel') || address.includes('event')) {
      return 'event';
    } else {
      return 'guest';
    }
  } catch (error) {
    console.error('Error parsing stored wallet data:', error);
    return null;
  }
}