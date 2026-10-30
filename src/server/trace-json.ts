export const traceEventByteLimit = 1024 * 1024;

export class TraceJsonFailure extends Error {
  constructor(readonly category: 'oversized' | 'export') {
    super('trace_serialization_failed');
  }
}

/** JSON.stringify semantics with an exact UTF-8 budget checked before it
 * encodes each value. A huge string or escape expansion cannot first allocate
 * an unbounded diagnostic JSON string. Nothing is truncated or substituted. */
export function traceJson(value: unknown, limit: number): string {
  let bytes = 0;
  let first = true;
  const properties = new WeakMap<object, number>();
  function charge(size: number) {
    bytes += size;
    if (bytes > limit) throw new TraceJsonFailure('oversized');
  }
  function quotedBytes(text: string) {
    let size = Buffer.byteLength(text) + 2;
    if (bytes + size > limit) throw new TraceJsonFailure('oversized');
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code === 34 || code === 92) size++;
      else if (code < 32) size += [8, 9, 10, 12, 13].includes(code) ? 1 : 5;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) index++;
        else size += 3;
      } else if (code >= 0xdc00 && code <= 0xdfff) size += 3;
      if (bytes + size > limit) throw new TraceJsonFailure('oversized');
    }
    return size;
  }
  try {
    const json = JSON.stringify(value, function (key, item) {
      const root = first;
      first = false;
      const array = Array.isArray(this);
      const omitted = item === undefined || typeof item === 'function' || typeof item === 'symbol';
      if (omitted && !array) return undefined;
      if (!root) {
        if (array) charge(key === '0' ? 0 : 1);
        else {
          const count = properties.get(this) ?? 0;
          charge((count ? 1 : 0) + quotedBytes(key) + 1);
          properties.set(this, count + 1);
        }
      }
      if (omitted || item === null) charge(4);
      else if (typeof item === 'string') charge(quotedBytes(item));
      else if (typeof item === 'number' || typeof item === 'boolean')
        charge(JSON.stringify(item).length);
      else if (typeof item === 'bigint') throw new TraceJsonFailure('export');
      else {
        charge(2);
        properties.set(item, 0);
      }
      return item;
    });
    if (json === undefined) throw new TraceJsonFailure('export');
    if (Buffer.byteLength(json) > limit) throw new TraceJsonFailure('oversized');
    return json;
  } catch (error) {
    throw error instanceof TraceJsonFailure ? error : new TraceJsonFailure('export');
  }
}
