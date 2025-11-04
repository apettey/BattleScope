export class EsiHttpError extends Error {
  readonly statusCode: number;
  readonly operationId: string;
  readonly url: string;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    options: { statusCode: number; operationId: string; url: string; responseBody?: unknown },
  ) {
    super(message);
    this.name = 'EsiHttpError';
    this.statusCode = options.statusCode;
    this.operationId = options.operationId;
    this.url = options.url;
    this.responseBody = options.responseBody;
  }
}

export class UnauthorizedAPIToken extends Error {
  readonly statusCode: number;
  readonly operationId: string;
  readonly url: string;

  constructor(message: string, options: { statusCode: number; operationId: string; url: string }) {
    super(message);
    this.name = 'UnauthorizedAPIToken';
    this.statusCode = options.statusCode;
    this.operationId = options.operationId;
    this.url = options.url;
  }
}
