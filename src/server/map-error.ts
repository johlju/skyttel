export class MapError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 409 = 409,
  ) {
    super(code);
  }
}
