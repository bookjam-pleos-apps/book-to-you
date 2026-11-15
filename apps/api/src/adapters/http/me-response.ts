import { meResponseSchema, type MeResponse } from "@voice-storybook/shared/contracts/v1";

import { isQuickStartEmail } from "../../domain/identity/quick-start-email";

export const toMeResponse = (account: { readonly id: string; readonly email: string }): MeResponse =>
  meResponseSchema.parse({ id: account.id, email: account.email, emailless: isQuickStartEmail(account.email) });
