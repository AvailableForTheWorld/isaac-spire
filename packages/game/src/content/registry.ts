export type ContentKey = string | number;

/**
 * Read-optimized registry used by content packs. Registration is explicit and
 * validates duplicate IDs early, while runtime lookup remains O(1).
 */
export class ContentRegistry<TKey extends ContentKey, TValue> {
  private readonly entries = new Map<TKey, TValue>();

  constructor(
    values: Iterable<TValue> = [],
    private readonly keyOf: (value: TValue) => TKey,
  ) {
    this.registerAll(values);
  }

  register(value: TValue, options: { replace?: boolean } = {}): this {
    const key = this.keyOf(value);
    if (this.entries.has(key) && !options.replace) {
      throw new Error(`Duplicate content key: ${String(key)}`);
    }
    this.entries.set(key, value);
    return this;
  }

  registerAll(values: Iterable<TValue>, options: { replace?: boolean } = {}): this {
    for (const value of values) this.register(value, options);
    return this;
  }

  get(key: TKey): TValue | undefined {
    return this.entries.get(key);
  }

  require(key: TKey): TValue {
    const value = this.get(key);
    if (!value) throw new Error(`Unknown content key: ${String(key)}`);
    return value;
  }

  has(key: TKey): boolean {
    return this.entries.has(key);
  }

  values(): TValue[] {
    return [...this.entries.values()];
  }

  filter(predicate: (value: TValue) => boolean): TValue[] {
    return this.values().filter(predicate);
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface ContentPack<TCard, TItem, TEnemy, TFloor> {
  id: string;
  version: string;
  cards?: readonly TCard[];
  items?: readonly TItem[];
  enemies?: readonly TEnemy[];
  floors?: readonly TFloor[];
}
