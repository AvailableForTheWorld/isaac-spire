import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { PersistedRun, RunState, RunSummary } from '@isaac-spire/game';
import { StoreService } from './store.service.js';

@Controller()
export class RunsController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  @Get('profile')
  profile() {
    return this.store.profile();
  }

  @Get('runs')
  runs(): Promise<RunSummary[]> {
    return this.store.listRuns();
  }

  @Get('runs/active/latest')
  async latestActiveRun(): Promise<PersistedRun> {
    const run = await this.store.latestActiveRun();
    if (!run) throw new NotFoundException('No active run was found');
    return run;
  }

  @Get('runs/:id')
  run(@Param('id') id: string): Promise<PersistedRun> {
    return this.store.getRun(id);
  }

  @Post('runs')
  create(@Body() snapshot: RunState): Promise<PersistedRun> {
    return this.persist(snapshot);
  }

  @Put('runs/:id')
  update(@Param('id') id: string, @Body() snapshot: RunState): Promise<PersistedRun> {
    if (snapshot.id !== id) throw new BadRequestException('Path and snapshot run IDs do not match');
    return this.persist(snapshot);
  }

  @Delete('runs/:id')
  async delete(@Param('id') id: string): Promise<{ deleted: true }> {
    await this.store.deleteRun(id);
    return { deleted: true };
  }

  @Get('maintenance/storage')
  storageStats() {
    return this.store.storageStats();
  }

  @Post('maintenance/storage/compact')
  compactStorage() {
    return this.store.compact();
  }

  private async persist(snapshot: RunState): Promise<PersistedRun> {
    try {
      return await this.store.saveRun(snapshot);
    } catch (error) {
      if (error instanceof TypeError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
