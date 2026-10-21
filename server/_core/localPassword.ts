import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

export const LOCAL_ADMIN_OPEN_ID = "desainlokal_local_admin";
let dummyHashPromise: Promise<string> | undefined;

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEMORY }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashLocalPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function getDummyLocalPasswordHash() {
  dummyHashPromise ??= hashLocalPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}

export async function verifyLocalPassword(password: string, encodedHash: string) {
  const [scheme, n, r, p, saltHex, keyHex, extra] = encodedHash.split("$");
  if (extra !== undefined || scheme !== "scrypt" || n !== String(SCRYPT_N) || r !== String(SCRYPT_R) || p !== String(SCRYPT_P)) return false;
  if (!/^[a-f0-9]{32}$/i.test(saltHex || "") || !/^[a-f0-9]{128}$/i.test(keyHex || "")) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, expected);
}
