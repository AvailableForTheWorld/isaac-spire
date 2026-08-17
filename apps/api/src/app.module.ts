import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { RunsController } from './runs.controller.js';
import { StoreService } from './store.service.js';

@Module({
  controllers: [HealthController, RunsController],
  providers: [StoreService],
})
export class AppModule {}
