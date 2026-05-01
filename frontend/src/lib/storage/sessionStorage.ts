import { Session } from "../../types/domain";

const SESSION_KEY = "vaultsphere.session";

export function loadSession(): Session | null {
  const stored = localStorage.getItem(SESSION_KEY);
  return stored ? (JSON.parse(stored) as Session) : null;
}

export function saveSession(session: Session | null) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}
