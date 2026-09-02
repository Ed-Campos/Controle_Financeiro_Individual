// Armazenamento local: a sessão é separada dos dados financeiros.
const LS_PREFIX = "financas-a-dois:";
const lsGet = (key) => window.localStorage.getItem(LS_PREFIX + key);
const lsSet = (key, value) => window.localStorage.setItem(LS_PREFIX + key, value);
const lsDelete = (key) => window.localStorage.removeItem(LS_PREFIX + key);

export const hasRealBackend = false;
export const storage = {
  async get(key, shared = false) {
    const actualKey = shared ? `shared:${key}` : key;
    const value = lsGet(actualKey);
    return value === null ? null : { key, value, shared };
  },
  async set(key, value, shared = false) {
    lsSet(shared ? `shared:${key}` : key, value);
    return { key, value, shared };
  },
  async delete(key, shared = false) {
    const actualKey = shared ? `shared:${key}` : key;
    const existed = lsGet(actualKey) !== null;
    lsDelete(actualKey);
    return { key, deleted: existed, shared };
  },
};
