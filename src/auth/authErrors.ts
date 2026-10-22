export class AuthRequiredError extends Error {
  constructor(message = 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export function isAuthRequiredError(error: unknown): error is AuthRequiredError {
  return error instanceof AuthRequiredError
    || (error instanceof Error && error.name === 'AuthRequiredError');
}
