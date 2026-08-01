import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LicensingService } from './licensing.service';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('licensing')
@Controller('licensing')
export class LicensingController {
  constructor(private readonly licensingService: LicensingService) {}

  /** Unauthenticated by necessity: there is no user yet on a fresh, unlicensed install. */
  @Public()
  @Get('status')
  getStatus() {
    return { activated: this.licensingService.isActivated() };
  }

  @Public()
  @Post('activate')
  activate(@Body() dto: ActivateLicenseDto) {
    return this.licensingService.activate(dto);
  }
}
