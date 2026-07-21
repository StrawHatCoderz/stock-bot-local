import type { LoginIdentity } from "../types.js";
import { buildIdentityBlock } from "./identity-block.js";
import { buildAdminPrompt } from "./admin-prompt.js";
import { buildManagerAssociatePrompt } from "./manager-associate-prompt.js";

export const buildSystemPrompt = (identity: LoginIdentity | undefined): string => {
  const identityBlock = buildIdentityBlock(identity);
  return identity?.role === "ADMIN"
    ? buildAdminPrompt(identityBlock)
    : buildManagerAssociatePrompt(identityBlock);
};
