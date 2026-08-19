import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { RunsController } from './runs.controller.js';
import { StoreService } from './store.service.js';
import { RunRepository } from './storage/run-repository.js';
import { loadStorageConfig } from './storage/storage-config.js';
import { SqliteRunRepository } from './storage/sqlite-run.repository.js';

@Module({
  controllers: [HealthController, RunsController],
  providers: [
    { provide: RunRepository, useFactory: () => new SqliteRunRepository(loadStorageConfig()) },
    StoreService,
  ],
})
export class AppModule {}
