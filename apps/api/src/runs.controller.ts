import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import type { PersistedRun, RunState } from '@isaac-spire/game';
import { StoreService } from './store.service.js';

@Controller()
export class RunsController {
  constructor(private readonly store: StoreService) {}

  @Get('profile')
  profile() {
    return this.store.profile();
  }

  @Get('runs')
  runs(): Promise<PersistedRun[]> {
    return this.store.listRuns();
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

  private async persist(snapshot: RunState): Promise<PersistedRun> {
    try {
      return await this.store.saveRun(snapshot);
    } catch (error) {
      if (error instanceof TypeError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
