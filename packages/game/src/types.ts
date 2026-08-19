/**
 * Backward-compatible type barrel. New modules may import a bounded context
 * directly from `domain/*` without depending on the entire game state graph.
 */
export * from './domain/player.js';
export * from './domain/enums.js';
export * from './domain/map.js';
export * from './domain/combat.js';
export * from './domain/run.js';
