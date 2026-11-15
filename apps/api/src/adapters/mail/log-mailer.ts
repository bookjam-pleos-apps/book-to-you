import type { Mailer } from "../../application/ports/mailer";

export const createLogMailer = (log: (line: string) => void): Mailer => ({
  sendOtp: async (email, code) => {
    log(`[dev mail] ${email} OTP ${code}`);
  },
});
