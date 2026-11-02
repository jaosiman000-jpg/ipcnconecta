import { createHash } from 'node:crypto'

export const INVITE_VALID_DAYS = 14

export function inviteIdFor(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 40)
}
