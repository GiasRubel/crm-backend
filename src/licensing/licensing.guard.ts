import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LicensingService } from './licensing.service';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

/**
 * Blocks the entire API until a valid Envato purchase code has been
 * activated. Runs before auth guards so an unlicensed install can still
 * reach `POST /licensing/activate` (marked @Public()) but nothing else.
 *
 * Only enforced when NODE_ENV=production — otherwise local/CI dev
 * environments would be locked out with no license on every fresh clone.
 */
@Injectable()
export class LicensingGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly licensingService: LicensingService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      return true;
    }

    if (this.licensingService.isActivated()) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    throw new HttpException(
      'This installation has not been licensed. Activate it with your Envato purchase code at POST /licensing/activate.',
      HttpStatus.FORBIDDEN,
    );
  }
}
