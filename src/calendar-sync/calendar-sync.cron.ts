import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import {
  CalendarConnection,
  CalendarConnectionDocument,
} from './calendar-connection.schema';
import { CalendarSyncService } from './calendar-sync.service';

@Injectable()
export class CalendarSyncCron {
  private readonly logger = new Logger(CalendarSyncCron.name);

  constructor(
    @InjectModel(CalendarConnection.name)
    private readonly connectionModel: Model<CalendarConnectionDocument>,
    private readonly calendarSyncService: CalendarSyncService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAllConnections(): Promise<void> {
    const connections = await this.connectionModel
      .find({ status: { $ne: 'disconnected' } })
      .exec();
    if (connections.length === 0) return;

    this.logger.log(`Reconciling ${connections.length} calendar connection(s)`);
    for (const connection of connections) {
      await this.calendarSyncService.reconcileConnection(connection);
    }
  }
}
