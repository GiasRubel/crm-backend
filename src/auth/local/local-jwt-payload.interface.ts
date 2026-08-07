export interface LocalAccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

export interface LocalRefreshTokenPayload {
  sub: string;
  tokenVersion: number;
  type: 'refresh';
}
