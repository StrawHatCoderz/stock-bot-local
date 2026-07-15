import { AsyncLocalStorage } from "node:async_hooks";

export interface SessionContext {
  token?: string;
}

export const sessionContext = new AsyncLocalStorage<SessionContext>();

export const getSessionToken = () => sessionContext.getStore()?.token;
