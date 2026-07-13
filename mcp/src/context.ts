import { AsyncLocalStorage } from "node:async_hooks";

export interface SessionContext {
  token?: string;
  storeId?: string;
  employeeId?: string;
  role?: string;
}

export const sessionContext = new AsyncLocalStorage<SessionContext>();

export const getSessionToken = () => sessionContext.getStore()?.token || process.env.SESSION_TOKEN;
export const getSessionStoreId = () => sessionContext.getStore()?.storeId || process.env.SESSION_STORE_ID;
export const getSessionEmployeeId = () => sessionContext.getStore()?.employeeId || process.env.SESSION_EMPLOYEE_ID;
export const getSessionRole = () => sessionContext.getStore()?.role || process.env.SESSION_ROLE;
