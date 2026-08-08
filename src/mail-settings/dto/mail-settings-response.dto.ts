export class MailSettingsResponseDto {
  enabled: boolean;
  host?: string;
  port?: number;
  secure: boolean;
  user?: string;
  hasPassword: boolean;
  fromAddress?: string;
  fromName?: string;
  updatedAt?: Date;
}
