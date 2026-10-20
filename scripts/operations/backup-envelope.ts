import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const header = Buffer.from("TCBACKUP1");
// Versioned authenticated binary envelope: header, 12-byte nonce, 16-byte GCM
// tag, ciphertext. Supply a random 32-byte key from independent secret storage.
export function sealBackup(plaintext: Buffer, key: Buffer) {
  if (key.length !== 32)
    throw Error("Backup key must contain 32 random bytes.");
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([header, nonce, cipher.getAuthTag(), ciphertext]);
}
export function openBackup(envelope: Buffer, key: Buffer) {
  try {
    if (
      key.length !== 32 ||
      envelope.length < header.length + 28 ||
      !envelope.subarray(0, header.length).equals(header)
    )
      throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      envelope.subarray(header.length, header.length + 12),
    );
    decipher.setAAD(header);
    decipher.setAuthTag(
      envelope.subarray(header.length + 12, header.length + 28),
    );
    // No plaintext is returned until authentication completes.
    return Buffer.concat([
      decipher.update(envelope.subarray(header.length + 28)),
      decipher.final(),
    ]);
  } catch {
    throw Error("Backup authentication failed; no SQL may be restored.");
  }
}
