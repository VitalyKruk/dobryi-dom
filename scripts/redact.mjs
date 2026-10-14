/*
 * Маскировка секретов в тексте для журналов Claude Code (scripts/log-prompt.mjs, scripts/log-claude-action.mjs):
 * токены, ключи, пароли и пароли в адресах подключения заменяются на ***.
 */
export function redact(s) {
  return s
    .replace(/\b(Bearer|token|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 ***")
    .replace(/\b(gh[pousr]_|github_pat_|sk-|xox[abp]-)[A-Za-z0-9_-]{8,}/g, "$1***")
    .replace(/((?:password|passwd|secret|api[_-]?key|token|пароль)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1***")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, "$1***@")
}
