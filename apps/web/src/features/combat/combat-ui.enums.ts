/** View-only discriminants. Domain and wire enums live in @isaac-spire/game. */
export enum CombatCardMode {
  Play = 'play',
  Discard = 'discard',
}

export enum CombatPileKind {
  Draw = 'draw',
  Discard = 'discard',
}

export enum ActiveDiscardScope {
  Single = 'single',
  All = 'all',
}
