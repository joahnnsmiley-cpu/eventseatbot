/** Simple deep equality for JSON-serializable objects. */
export function deepEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Deep clone for JSON-serializable objects. */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
