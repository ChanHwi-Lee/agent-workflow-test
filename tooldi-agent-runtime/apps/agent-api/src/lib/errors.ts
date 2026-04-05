export class AgentApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AgentApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("validation_error", message, 400, details);
  }
}

export class NotFoundError extends AgentApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("not_found", message, 404, details);
  }
}

export class ConflictError extends AgentApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("conflict", message, 409, details);
  }
}

export class NotImplementedYetError extends AgentApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("not_implemented_yet", message, 501, details);
  }
}
