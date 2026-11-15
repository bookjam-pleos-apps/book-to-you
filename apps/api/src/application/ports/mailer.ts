export interface Mailer {
  sendOtp(email: string, code: string): Promise<void>;
}
