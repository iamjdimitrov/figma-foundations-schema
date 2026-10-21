export class FoundationsError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FoundationsError';
    this.code = code;
    Object.assign(this, details);
  }
  toJSON() {
    return Object.fromEntries(['code', 'message', 'file', 'pointer', 'resource', 'context'].filter(k => this[k] !== undefined).map(k => [k, this[k]]));
  }
}
export function fail(code, message, details) { throw new FoundationsError(code, message, details); }
export const escapePointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
