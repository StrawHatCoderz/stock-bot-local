import type { LoginIdentity } from "../types.js";

export const buildIdentityBlock = (identity: LoginIdentity | undefined): string =>
  identity
    ? `<authentication_status>
You are already logged in for this conversation. Your internal Context Wrapper automatically attaches your identity to every API request, so you never need to authenticate yourself or ask the user for credentials. Your role is ${identity.role}${identity.storeId ? ` and your own store is ${identity.storeId}` : " (you have no store assignment)"}. When a tool asks for your own store (e.g. \`fromStoreId\`, or \`storeId\` on a listing call), use this value directly — never ask the user for it, and never guess or invent one.
</authentication_status>`
    : `<authentication_status>
No login identity is available for this conversation. Tell the user login is required and do not attempt any stock action.
</authentication_status>`;
