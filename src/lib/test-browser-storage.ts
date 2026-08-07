/**
 * A minimal in-memory `localStorage`/`sessionStorage` for tests that import zustand stores.
 *
 * Not a convenience: `persist` writes on every `set`, and with no storage present it prints a
 * warning per write, which buries the actual test output. Import this module *before* any
 * store module — ES modules evaluate in import order, so being first in the import list is
 * what makes the shim exist by the time `persist` looks for it.
 */

class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length() {
    return this.#entries.size;
  }
  key(index: number) {
    return [...this.#entries.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.#entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.#entries.set(key, String(value));
  }
  removeItem(key: string) {
    this.#entries.delete(key);
  }
  clear() {
    this.#entries.clear();
  }
  [name: string]: unknown;
}

const globalScope = globalThis as unknown as {
  localStorage?: Storage;
  sessionStorage?: Storage;
};

/**
 * Presence is not enough to go on. Node defines `localStorage` and `sessionStorage` as
 * globals whose methods only exist when the runtime was started with `--localstorage-file`,
 * so the naive `if (!globalThis.localStorage)` check finds an object and installs nothing.
 * Ask whether it actually works instead.
 */
function isUsableStorage(candidate: unknown): candidate is Storage {
  return typeof (candidate as Storage | undefined)?.setItem === "function";
}

if (!isUsableStorage(globalScope.localStorage)) globalScope.localStorage = new MemoryStorage();
if (!isUsableStorage(globalScope.sessionStorage)) globalScope.sessionStorage = new MemoryStorage();

// No `window` shim. zustand's persist middleware reaches for `window.localStorage` and will
// print "the given storage is currently unavailable" on every write without one — noisy, but
// harmless, and the alternative is worse: a `window` in scope makes TanStack Query believe it
// is in a browser and start pausing fetches on focus and online state it cannot observe,
// which hangs any test that awaits a query.

export const testSessionStorage = globalScope.sessionStorage as Storage;
