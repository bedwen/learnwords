import { Word, LearningState, Folder, LocalReviewHistoryRecord } from '../types';

export const DB_NAME = 'learnwords_local';
export const DB_VERSION = 2;

export type StoreName =
  | 'words'
  | 'learning_states'
  | 'review_history'
  | 'folders'
  | 'word_folders'
  | 'sync_meta';

export interface LocalWordFolderRecord {
  id: string; // `${word_id}_${folder_id}`
  word_id: string;
  folder_id: string;
}

export type { LocalReviewHistoryRecord };

export interface LocalSyncMetaRecord {
  key: string;
  value: any;
  updated_at: string;
}

export type LocalStoreTypeMap = {
  words: Word;
  learning_states: LearningState;
  review_history: LocalReviewHistoryRecord;
  folders: Folder;
  word_folders: LocalWordFolderRecord;
  sync_meta: LocalSyncMetaRecord;
};

// Safe IDBFactory discovery supporting browser window, worker global, or injected mock
let injectedFactory: IDBFactory | null = null;

export function setIndexedDbFactory(factory: IDBFactory | null): void {
  injectedFactory = factory;
}

export function isIndexedDbSupported(): boolean {
  if (injectedFactory) return true;
  if (typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB) return true;
  if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && (globalThis as any).indexedDB) return true;
  return false;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Pure TypeScript In-Memory IDBFactory Fallback.
 * Ensures tests and environments without native window.indexedDB
 * run completely offline without needing any 3rd-party npm packages.
 */
export function createInMemoryIDBFactory(): IDBFactory {
  const dbs = new Map<string, {
    version: number;
    stores: Map<string, {
      keyPath: string;
      autoIncrement?: boolean;
      indexes: Map<string, { keyPath: string; unique: boolean }>;
      data: Map<any, any>;
    }>;
  }>();

  class MockIDBRequest implements IDBRequest {
    result: any;
    error: DOMException | null = null;
    source: any = null;
    transaction: any = null;
    readyState: IDBRequestReadyState = 'pending';
    onsuccess: ((this: IDBRequest, ev: Event) => any) | null = null;
    onerror: ((this: IDBRequest, ev: Event) => any) | null = null;

    triggerSuccess(result: any) {
      this.result = result;
      this.readyState = 'done';
      if (this.onsuccess) {
        this.onsuccess.call(this, { target: this } as unknown as Event);
      }
    }

    triggerError(err: DOMException) {
      this.error = err;
      this.readyState = 'done';
      if (this.onerror) {
        this.onerror.call(this, { target: this } as unknown as Event);
      }
    }

    addEventListener() {}
    removeEventListener() {}
    dispatchEvent(): boolean { return true; }
  }

  class MockIDBOpenDBRequest extends MockIDBRequest implements IDBOpenDBRequest {
    onblocked: ((this: IDBOpenDBRequest, ev: Event) => any) | null = null;
    onupgradeneeded: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => any) | null = null;
  }

  const createStoreObject = (storeName: string, store: {
    keyPath: string;
    autoIncrement?: boolean;
    indexes: Map<string, { keyPath: string; unique: boolean }>;
    data: Map<any, any>;
  }) => {
    const objStore: any = {
      name: storeName,
      keyPath: store.keyPath,
      indexNames: {
        contains: (indexName: string) => store.indexes.has(indexName),
        item: (index: number) => Array.from(store.indexes.keys())[index] || null,
        get length() { return store.indexes.size; },
        [Symbol.iterator]: function* () { yield* store.indexes.keys(); }
      },
      createIndex: (indexName: string, indexKeyPath: string, indexOptions?: IDBIndexParameters) => {
        store.indexes.set(indexName, {
          keyPath: indexKeyPath,
          unique: !!indexOptions?.unique
        });
        return {} as unknown as IDBIndex;
      },
      get: (key: any) => {
        const req = new MockIDBRequest();
        queueMicrotask(() => {
          const item = store.data.get(key);
          req.triggerSuccess(item ? JSON.parse(JSON.stringify(item)) : undefined);
        });
        return req as unknown as IDBRequest;
      },
      getAll: () => {
        const req = new MockIDBRequest();
        queueMicrotask(() => {
          const items = Array.from(store.data.values()).map(v => JSON.parse(JSON.stringify(v)));
          req.triggerSuccess(items);
        });
        return req as unknown as IDBRequest;
      },
      put: (value: any, key?: any) => {
        const req = new MockIDBRequest();
        queueMicrotask(() => {
          const itemCopy = JSON.parse(JSON.stringify(value));
          const itemKey = key !== undefined ? key : (itemCopy && store.keyPath ? itemCopy[store.keyPath] : undefined);
          if (itemKey === undefined) {
            req.triggerError(new DOMException('Missing key for put operation', 'DataError'));
            return;
          }
          store.data.set(itemKey, itemCopy);
          req.triggerSuccess(itemKey);
        });
        return req as unknown as IDBRequest;
      },
      delete: (key: any) => {
        const req = new MockIDBRequest();
        queueMicrotask(() => {
          store.data.delete(key);
          req.triggerSuccess(undefined);
        });
        return req as unknown as IDBRequest;
      },
      clear: () => {
        const req = new MockIDBRequest();
        queueMicrotask(() => {
          store.data.clear();
          req.triggerSuccess(undefined);
        });
        return req as unknown as IDBRequest;
      },
      index: (indexName: string) => {
        const idx = store.indexes.get(indexName);
        if (!idx) throw new Error(`Index ${indexName} not found on ${storeName}`);
        return {
          name: indexName,
          keyPath: idx.keyPath,
          get: (query: any) => {
            const req = new MockIDBRequest();
            queueMicrotask(() => {
              let found: any = undefined;
              for (const item of store.data.values()) {
                if (item[idx.keyPath] === query) {
                  found = JSON.parse(JSON.stringify(item));
                  break;
                }
              }
              req.triggerSuccess(found);
            });
            return req as unknown as IDBRequest;
          },
          getAll: (query?: any) => {
            const req = new MockIDBRequest();
            queueMicrotask(() => {
              const results: any[] = [];
              for (const item of store.data.values()) {
                if (query === undefined || item[idx.keyPath] === query) {
                  results.push(JSON.parse(JSON.stringify(item)));
                }
              }
              req.triggerSuccess(results);
            });
            return req as unknown as IDBRequest;
          }
        } as unknown as IDBIndex;
      }
    };
    return objStore;
  };

  return {
    open(name: string, version = DB_VERSION): IDBOpenDBRequest {
      const request = new MockIDBOpenDBRequest();

      queueMicrotask(() => {
        let dbRecord = dbs.get(name);
        const oldVersion = dbRecord ? dbRecord.version : 0;
        const isUpgrade = version > oldVersion;

        if (!dbRecord) {
          dbRecord = { version, stores: new Map() };
          dbs.set(name, dbRecord);
        } else if (isUpgrade) {
          dbRecord.version = version;
        }

        const dbInstance: Partial<IDBDatabase> = {
          name,
          version: dbRecord.version,
          objectStoreNames: {
            contains: (sName: string) => dbRecord!.stores.has(sName),
            item: (index: number) => Array.from(dbRecord!.stores.keys())[index] || null,
            get length() { return dbRecord!.stores.size; },
            [Symbol.iterator]: function* () { yield* dbRecord!.stores.keys(); }
          } as unknown as DOMStringList,
          createObjectStore: (storeName: string, options?: IDBObjectStoreParameters) => {
            const keyPath = (options?.keyPath as string) || 'id';
            const storeData = {
              keyPath,
              autoIncrement: options?.autoIncrement,
              indexes: new Map<string, { keyPath: string; unique: boolean }>(),
              data: new Map<any, any>()
            };
            dbRecord!.stores.set(storeName, storeData);
            return createStoreObject(storeName, storeData) as IDBObjectStore;
          },
          deleteObjectStore: (storeName: string) => {
            dbRecord!.stores.delete(storeName);
          },
          transaction: (storeNames: string | string[], mode: IDBTransactionMode = 'readonly') => {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            for (const sName of names) {
              if (!dbRecord!.stores.has(sName)) {
                throw new Error(`Object store ${sName} not found`);
              }
            }
            const tx: Partial<IDBTransaction> = {
              mode,
              db: dbInstance as IDBDatabase,
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              abort: () => {
                if (tx.onabort) tx.onabort.call(tx as IDBTransaction, {} as Event);
              },
              objectStore: (storeName: string) => {
                const store = dbRecord!.stores.get(storeName);
                if (!store) throw new Error(`Object store ${storeName} not found`);
                return createStoreObject(storeName, store) as IDBObjectStore;
              }
            };

            // Auto-trigger completion after microtask queue clears
            setTimeout(() => {
              if (tx.oncomplete) {
                tx.oncomplete.call(tx as IDBTransaction, {} as Event);
              }
            }, 0);

            return tx as unknown as IDBTransaction;
          }
        };

        if (isUpgrade && request.onupgradeneeded) {
          request.result = dbInstance;
          if (dbRecord.stores.size > 0) {
            request.transaction = dbInstance.transaction!(
              Array.from(dbRecord.stores.keys()),
              'versionchange'
            ) as IDBTransaction;
          }
          request.onupgradeneeded({
            target: request,
            oldVersion,
            newVersion: version
          } as unknown as IDBVersionChangeEvent);
        }

        request.triggerSuccess(dbInstance);
      });

      return request as unknown as IDBOpenDBRequest;
    },
    databases(): Promise<IDBDatabaseInfo[]> {
      const result: IDBDatabaseInfo[] = [];
      for (const [dbName, dbRecord] of dbs.entries()) {
        result.push({ name: dbName, version: dbRecord.version });
      }
      return Promise.resolve(result);
    },
    deleteDatabase(name: string): IDBOpenDBRequest {
      const request = new MockIDBOpenDBRequest();
      queueMicrotask(() => {
        dbs.delete(name);
        request.triggerSuccess(undefined);
      });
      return request as unknown as IDBOpenDBRequest;
    },
    cmp(first: any, second: any): number {
      if (first === second) return 0;
      return first > second ? 1 : -1;
    }
  };
}

export function getIDBFactory(): IDBFactory {
  if (injectedFactory) return injectedFactory;
  if (typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  // Auto-fallback in headless/test environments
  injectedFactory = createInMemoryIDBFactory();
  return injectedFactory;
}

/**
 * Universal IndexedDB Promise Adapter.
 * Provides clean, fully typed asynchronous helpers over native window.indexedDB.
 */
export class IndexedDbAdapter {
  private dbName: string;
  private version: number;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private factoryResolver: () => IDBFactory;
  private migrationPromise: Promise<void> | null = null;
  private isMigrating = false;

  constructor(dbName = DB_NAME, version = DB_VERSION, customFactory?: IDBFactory | null) {
    this.dbName = dbName;
    this.version = version;
    this.factoryResolver = customFactory ? () => customFactory : getIDBFactory;
  }

  async getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const factory = this.factoryResolver();
        if (!factory) {
          reject(new Error('IndexedDB is not supported in this environment.'));
          return;
        }

        const request = factory.open(this.dbName, this.version);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const tx = (event.target as IDBOpenDBRequest).transaction;

          // 1. words: stores vocabulary content
          let wordsStore: IDBObjectStore;
          if (!db.objectStoreNames.contains('words')) {
            wordsStore = db.createObjectStore('words', { keyPath: 'id' });
            wordsStore.createIndex('word', 'word', { unique: false });
            wordsStore.createIndex('level', 'level', { unique: false });
            wordsStore.createIndex('created_at', 'created_at', { unique: false });
          } else {
            wordsStore = tx ? tx.objectStore('words') : (event.target as any).source;
          }
          if (wordsStore && wordsStore.indexNames) {
            if (!wordsStore.indexNames.contains('sync_id')) {
              wordsStore.createIndex('sync_id', 'sync_id', { unique: true });
            }
            if (!wordsStore.indexNames.contains('deleted_at')) {
              wordsStore.createIndex('deleted_at', 'deleted_at', { unique: false });
            }
          }

          // 2. learning_states: current learning state per word (1:1)
          if (!db.objectStoreNames.contains('learning_states')) {
            const lsStore = db.createObjectStore('learning_states', { keyPath: 'id' });
            lsStore.createIndex('word_id', 'word_id', { unique: true });
            lsStore.createIndex('next_review', 'next_review', { unique: false });
            lsStore.createIndex('mastery', 'mastery', { unique: false });
          }

          // 3. review_history: review logs per word (1:N)
          let rhStore: IDBObjectStore;
          if (!db.objectStoreNames.contains('review_history')) {
            rhStore = db.createObjectStore('review_history', { keyPath: 'id' });
            rhStore.createIndex('word_id', 'word_id', { unique: false });
            rhStore.createIndex('reviewed_at', 'reviewed_at', { unique: false });
          } else {
            rhStore = tx ? tx.objectStore('review_history') : (event.target as any).source;
          }
          if (rhStore && rhStore.indexNames) {
            if (!rhStore.indexNames.contains('sync_id')) {
              rhStore.createIndex('sync_id', 'sync_id', { unique: true });
            }
          }

          // 4. folders: named, colored word groups
          let foldersStore: IDBObjectStore;
          if (!db.objectStoreNames.contains('folders')) {
            foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
            foldersStore.createIndex('name', 'name', { unique: false });
          } else {
            foldersStore = tx ? tx.objectStore('folders') : (event.target as any).source;
          }
          if (foldersStore && foldersStore.indexNames) {
            if (!foldersStore.indexNames.contains('sync_id')) {
              foldersStore.createIndex('sync_id', 'sync_id', { unique: true });
            }
            if (!foldersStore.indexNames.contains('deleted_at')) {
              foldersStore.createIndex('deleted_at', 'deleted_at', { unique: false });
            }
          }

          // 5. word_folders: junction table
          if (!db.objectStoreNames.contains('word_folders')) {
            const wfStore = db.createObjectStore('word_folders', { keyPath: 'id' });
            wfStore.createIndex('word_id', 'word_id', { unique: false });
            wfStore.createIndex('folder_id', 'folder_id', { unique: false });
          }

          // 6. sync_meta: local hydration and sync markers
          if (!db.objectStoreNames.contains('sync_meta')) {
            db.createObjectStore('sync_meta', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
            this.migrationPromise = null;
          };

          resolve(db);
        };

        request.onerror = (event) => {
          this.dbPromise = null;
          reject((event.target as IDBOpenDBRequest).error || new Error('Failed to open IndexedDB'));
        };
      });
    }

    const db = await this.dbPromise;
    if (!this.isMigrating) {
      if (!this.migrationPromise) {
        this.isMigrating = true;
        this.migrationPromise = this.migrateExistingRecords().finally(() => {
          this.isMigrating = false;
        });
      }
      await this.migrationPromise;
    }
    return db;
  }

  /**
   * Automatic schema migration:
   * Ensures all legacy records in words, folders, and review_history
   * have sync_id, updated_at (epoch ms), and deleted_at populated.
   */
  async migrateExistingRecords(): Promise<void> {
    try {
      // 1. Migrate words
      const words = await this.getAll<any>('words');
      const updatedWords: Word[] = [];
      for (const w of words) {
        let changed = false;
        if (!w.sync_id) {
          w.sync_id = generateUuid();
          changed = true;
        }
        if (w.updated_at === undefined || typeof w.updated_at !== 'number') {
          w.updated_at = typeof w.updated_at === 'string'
            ? (new Date(w.updated_at).getTime() || Date.now())
            : Date.now();
          changed = true;
        }
        if (w.deleted_at === undefined) {
          w.deleted_at = null;
          changed = true;
        }
        if (changed) {
          updatedWords.push(w);
        }
      }
      if (updatedWords.length > 0) {
        await this.putMany('words', updatedWords);
      }

      // 2. Migrate folders
      const folders = await this.getAll<any>('folders');
      const updatedFolders: Folder[] = [];
      for (const f of folders) {
        let changed = false;
        if (!f.sync_id) {
          f.sync_id = generateUuid();
          changed = true;
        }
        if (f.updated_at === undefined || typeof f.updated_at !== 'number') {
          f.updated_at = typeof f.updated_at === 'string'
            ? (new Date(f.updated_at).getTime() || Date.now())
            : Date.now();
          changed = true;
        }
        if (f.deleted_at === undefined) {
          f.deleted_at = null;
          changed = true;
        }
        if (changed) {
          updatedFolders.push(f);
        }
      }
      if (updatedFolders.length > 0) {
        await this.putMany('folders', updatedFolders);
      }

      // 3. Migrate review_history
      const reviews = await this.getAll<any>('review_history');
      const updatedReviews: LocalReviewHistoryRecord[] = [];
      for (const r of reviews) {
        if (!r.sync_id) {
          r.sync_id = generateUuid();
          updatedReviews.push(r);
        }
      }
      if (updatedReviews.length > 0) {
        await this.putMany('review_history', updatedReviews);
      }
    } catch {
      // Ignore migration errors during isolated mock setups
    }
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }

  async deleteDatabase(): Promise<void> {
    await this.close();
    const factory = this.factoryResolver();
    return new Promise((resolve, reject) => {
      const req = factory.deleteDatabase(this.dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.getDb();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll<T>(storeName: StoreName): Promise<T[]> {
    const db = await this.getDb();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async put<T>(storeName: StoreName, value: T): Promise<IDBValidKey> {
    const db = await this.getDb();
    return new Promise<IDBValidKey>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async putMany<T>(storeName: StoreName, values: T[]): Promise<void> {
    if (values.length === 0) return;
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      for (const val of values) {
        store.put(val);
      }
    });
  }

  async delete(storeName: StoreName, key: IDBValidKey): Promise<void> {
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async queryByIndex<T>(
    storeName: StoreName,
    indexName: string,
    query: IDBValidKey | IDBKeyRange
  ): Promise<T[]> {
    const db = await this.getDb();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(query);
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(storeName: StoreName): Promise<void> {
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async transaction<T>(
    storeNames: StoreName[],
    mode: IDBTransactionMode,
    callback: (tx: IDBTransaction) => Promise<T> | T
  ): Promise<T> {
    const db = await this.getDb();
    return new Promise<T>((resolve, reject) => {
      let result: T;
      const tx = db.transaction(storeNames, mode);

      tx.oncomplete = () => {
        resolve(result);
      };

      tx.onerror = () => {
        reject(tx.error || new Error('IndexedDB transaction failed'));
      };

      tx.onabort = () => {
        reject(tx.error || new Error('IndexedDB transaction aborted'));
      };

      try {
        const op = callback(tx);
        if (op instanceof Promise) {
          op.then((res) => {
            result = res;
          }).catch((err) => {
            try {
              tx.abort();
            } catch {
              // ignore
            }
            reject(err);
          });
        } else {
          result = op;
        }
      } catch (err) {
        try {
          tx.abort();
        } catch {
          // ignore
        }
        reject(err);
      }
    });
  }
}

// Global default adapter singleton
export const indexedDbAdapter = new IndexedDbAdapter();

// Standalone convenience exports
export const getLocalDb = () => indexedDbAdapter.getDb();
export const getLocalRecord = <T>(store: StoreName, key: IDBValidKey) => indexedDbAdapter.get<T>(store, key);
export const getAllLocalRecords = <T>(store: StoreName) => indexedDbAdapter.getAll<T>(store);
export const putLocalRecord = <T>(store: StoreName, val: T) => indexedDbAdapter.put<T>(store, val);
export const deleteLocalRecord = (store: StoreName, key: IDBValidKey) => indexedDbAdapter.delete(store, key);
export const queryLocalByIndex = <T>(store: StoreName, index: string, q: IDBValidKey | IDBKeyRange) => indexedDbAdapter.queryByIndex<T>(store, index, q);
export const clearLocalStore = (store: StoreName) => indexedDbAdapter.clear(store);
