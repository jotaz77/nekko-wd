// NEKKO WD — Contexto local da aplicação
(() => {
  'use strict';

  const STORAGE_KEY = 'nekko_wd_context';

  function read() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);

      if (!raw) return {};

      const parsed = JSON.parse(raw);

      return parsed && typeof parsed === 'object'
        ? parsed
        : {};
    } catch (error) {
      console.error('[NEKKO WD] Erro ao ler contexto:', error);
      return {};
    }
  }

  function write(context) {
    if (!context || typeof context !== 'object') {
      throw new Error('O contexto precisa ser um objeto.');
    }

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(context)
    );

    return read();
  }

  function get(key) {
    return read()[key] ?? null;
  }

  function set(key, value) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('Chave de contexto inválida.');
    }

    const context = read();
    context[key] = value;

    return write(context);
  }

  function remove(key) {
    const context = read();
    delete context[key];

    return write(context);
  }

  function clear() {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }

  function getContext() {
    return read();
  }

  window.NekkoStorage = Object.freeze({
    read,
    write,
    get,
    set,
    remove,
    clear,
    getContext
  });
})();
