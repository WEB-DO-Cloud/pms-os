import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_VERSION = 'v1'
const LEGACY_IV = 'stub'

function encryptionKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY
  // ponytail: scrypt-derived key from env string / hex; set SECRETS_ENCRYPTION_KEY in prod
  if (!raw) return scryptSync('pms-os-dev-secrets', 'pms-os-salt', 32)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return scryptSync(raw, 'pms-os-salt', 32)
}

export type EncryptedSecret = {
  ciphertext: string
  iv: string
  keyVersion: string
}

/** AES-256-GCM encrypt. Ciphertext is base64(ciphertext || authTag). */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: Buffer.concat([enc, tag]).toString('base64'),
    iv: iv.toString('base64'),
    keyVersion: KEY_VERSION,
  }
}

/** Decrypt network secret ciphertext. Legacy U5 stub rows pass through plaintext. */
export function decryptSecret(ciphertext: string, iv: string, _keyVersion: string): string {
  if (!iv || iv === LEGACY_IV) return ciphertext
  try {
    const buf = Buffer.from(ciphertext, 'base64')
    const data = buf.subarray(0, -16)
    const tag = buf.subarray(-16)
    const decipher = createDecipheriv(ALGO, encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    // ponytail: tolerate pre-encryption fixture rows until all networks rotate
    return ciphertext
  }
}

export type NetworkSecretMaterial = {
  ciphertext: string
  iv: string
  keyVersion: string
}

export function resolveSecret(row: NetworkSecretMaterial): string {
  return decryptSecret(row.ciphertext, row.iv, row.keyVersion)
}

/** Mask for API/UI — never return full secret. */
export function maskSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null
  if (plaintext.length <= 4) return '••••'
  return `••••••••${plaintext.slice(-4)}`
}

export type SecretPublicStatus = {
  configured: boolean
  masked: string | null
}

export function toPublicSecretStatus(
  row: NetworkSecretMaterial | null,
): SecretPublicStatus {
  if (!row) return { configured: false, masked: null }
  return { configured: true, masked: maskSecret(resolveSecret(row)) }
}
