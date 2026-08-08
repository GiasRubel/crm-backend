import { OrgMailSettingsDocument } from '../org-mail-settings.schema';
import { MailSettingsResponseDto } from '../dto/mail-settings-response.dto';

export function toMailSettingsResponseDto(
  doc: OrgMailSettingsDocument | null,
): MailSettingsResponseDto {
  if (!doc) {
    return { enabled: false, secure: false, hasPassword: false };
  }
  return {
    enabled: doc.enabled,
    host: doc.host,
    port: doc.port,
    secure: doc.secure,
    user: doc.user,
    hasPassword: Boolean(doc.encryptedPass),
    fromAddress: doc.fromAddress,
    fromName: doc.fromName,
    updatedAt: doc.updatedAt,
  };
}
