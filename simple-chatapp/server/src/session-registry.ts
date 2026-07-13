import { Session } from "./session.js";

export const sessions: Map<string, Session> = new Map();

export function getOrCreateSession(chatId: string): Session {
  let session = sessions.get(chatId);
  if (!session) {
    session = new Session(chatId);
    sessions.set(chatId, session);
  }
  return session;
}
