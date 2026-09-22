import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), ".data");

type Identified = { id: string };

export type Collection<T extends Identified> = {
  all(): T[];
  get(id: string): T | null;
  put(item: T): T;
  remove(id: string): boolean;
  where(predicate: (item: T) => boolean): T[];
};

const caches = new Map<string, Map<string, Identified>>();

function filePath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

function load<T extends Identified>(name: string): Map<string, T> {
  const cached = caches.get(name);
  if (cached) return cached as Map<string, T>;
  const items = existsSync(filePath(name)) ? (JSON.parse(readFileSync(filePath(name), "utf8")) as T[]) : [];
  const map = new Map(items.map((item) => [item.id, item]));
  caches.set(name, map);
  return map;
}

function persist(name: string, items: Map<string, Identified>) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(filePath(name), JSON.stringify([...items.values()], null, 2));
}

/** A typed collection backed by `.data/<name>.json`: reads hit memory, writes go through to disk. */
export function collection<T extends Identified>(name: string): Collection<T> {
  return {
    all: () => [...load<T>(name).values()],
    get: (id) => load<T>(name).get(id) ?? null,
    put: (item) => {
      const items = load<T>(name);
      items.set(item.id, item);
      persist(name, items);
      return item;
    },
    remove: (id) => {
      const items = load<T>(name);
      const removed = items.delete(id);
      if (removed) persist(name, items);
      return removed;
    },
    where: (predicate) => [...load<T>(name).values()].filter(predicate),
  };
}

export function resetCollections() {
  caches.clear();
}
