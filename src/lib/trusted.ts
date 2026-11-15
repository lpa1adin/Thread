/**
 * S4: Trusted Types. Политика по умолчанию — последний рубеж: любая строка, которую сторонний код
 * попытается вставить как HTML, проходит санитизацию; адреса скриптов разрешены только свои; eval запрещён.
 */
import DOMPurify from 'dompurify';

interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createHTML?: (s: string) => string; createScriptURL?: (s: string) => string }): unknown;
}

const tt = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes;

if (tt) {
  try {
    tt.createPolicy('default', {
      createHTML: (html) => DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: false }),
      createScriptURL: (url) => {
        if (new URL(url, location.href).origin !== location.origin) throw new TypeError('Сторонний скрипт запрещён');
        return url;
      },
    });
  } catch {
    // Политика уже создана (повторная загрузка модуля при разработке).
  }
}
