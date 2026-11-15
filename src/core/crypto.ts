/**
 * S1–S2: ключ из мастер-пароля (Argon2id) и шифрование объектов AES-256-GCM (Web Crypto API).
 * Формат зашифрованного объекта: 12 байт вектора инициализации + шифртекст с меткой подлинности.
 * Тот же формат в ВКР передаётся на сервер без изменений.
 */
import { argon2id } from 'hash-wasm';

export interface KdfParams {
  algo: 'argon2id';
  /** Соль в base64. */
  salt: string;
  iterations: number;
  /** Память в КиБ. */
  memory: number;
  parallelism: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function newKdfParams(): KdfParams {
  // Параметры не ниже рекомендаций OWASP для Argon2id (19 МиБ, 2 прохода).
  return { algo: 'argon2id', salt: toBase64(crypto.getRandomValues(new Uint8Array(16))), iterations: 3, memory: 32 * 1024, parallelism: 1 };
}

export async function deriveKey(password: string, params: KdfParams): Promise<CryptoKey> {
  const raw = await argon2id({
    password: password.normalize('NFKC'),
    salt: fromBase64(params.salt),
    iterations: params.iterations,
    memorySize: params.memory,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'binary',
  });
  const key = await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return key;
}

/** aad связывает шифртекст с видом и идентификатором объекта: запись нельзя подставить вместо другой. */
export async function encryptText(key: CryptoKey, text: string, aad: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(text));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return out;
}

export async function decryptText(key: CryptoKey, data: Uint8Array, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: enc.encode(aad) },
    key,
    data.slice(12),
  );
  return dec.decode(pt);
}
