export class TokenPairResponseDto {
  accessToken: string;
  refreshToken: string;
  /** Seconds until accessToken expires, so the caller can schedule a refresh. */
  expiresIn: number;
}
