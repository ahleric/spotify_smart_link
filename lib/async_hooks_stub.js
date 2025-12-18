// Minimal stub for async_hooks to satisfy edge/browser bundling.
class AsyncLocalStorage {
  constructor() {
    this.store = undefined;
  }
  getStore() {
    return this.store;
  }
  run(store, callback) {
    this.store = store;
    return callback();
  }
}

module.exports = { AsyncLocalStorage };
