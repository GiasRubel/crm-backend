import { ConfigService } from '@nestjs/config';

export enum DeploymentMode {
  Standalone = 'standalone',
  Saas = 'saas',
}

/** Regular License (standalone) is the default — SaaS billing must be opted into. */
export function getDeploymentMode(configService: ConfigService): DeploymentMode {
  const mode = configService.get<string>('DEPLOYMENT_MODE', DeploymentMode.Standalone);
  return mode === DeploymentMode.Saas ? DeploymentMode.Saas : DeploymentMode.Standalone;
}
