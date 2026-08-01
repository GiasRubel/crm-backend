import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import { AppService } from './app.service';
import { getDeploymentMode } from './config/deployment-mode';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Lets the frontend mirror the backend's licensing tier without its own env var to keep in sync. */
  @Get('config')
  @Public()
  getConfig() {
    return { deploymentMode: getDeploymentMode(this.configService) };
  }
}
