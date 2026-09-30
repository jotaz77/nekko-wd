// NEKKO WD — Camada de acesso à API
(() => {
  'use strict';

  function getClient() {
    if (!window.supabaseClient) {
      throw new Error(
        '[NEKKO WD] Supabase não inicializado.'
      );
    }

    return window.supabaseClient;
  }

  function from(table) {
    if (!table || typeof table !== 'string') {
      throw new Error('Nome da tabela inválido.');
    }

    return getClient().from(table);
  }

  async function selectOne(table, options = {}) {
    const {
      columns = '*',
      filters = {},
      maybeSingle = true
    } = options;

    let query = from(table).select(columns);

    for (const [column, value] of Object.entries(filters)) {
      query = value === null
        ? query.is(column, null)
        : query.eq(column, value);
    }

    const result = maybeSingle
      ? await query.maybeSingle()
      : await query;

    if (result.error) throw result.error;

    return result.data;
  }

  async function selectMany(table, options = {}) {
    const {
      columns = '*',
      filters = {},
      orderBy,
      ascending = true,
      limit
    } = options;

    let query = from(table).select(columns);

    for (const [column, value] of Object.entries(filters)) {
      query = value === null
        ? query.is(column, null)
        : query.eq(column, value);
    }

    if (orderBy) {
      query = query.order(orderBy, { ascending });
    }

    if (Number.isInteger(limit) && limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data;
  }

  async function insertOne(table, values, returning = '*') {
    const { data, error } = await from(table)
      .insert(values)
      .select(returning)
      .single();

    if (error) throw error;

    return data;
  }

  async function updateRows(table, values, filters = {}) {
    let query = from(table).update(values);

    for (const [column, value] of Object.entries(filters)) {
      query = value === null
        ? query.is(column, null)
        : query.eq(column, value);
    }

    const { data, error } = await query.select();

    if (error) throw error;

    return data;
  }

  async function deleteRows(table, filters = {}) {
    let query = from(table).delete();

    for (const [column, value] of Object.entries(filters)) {
      query = value === null
        ? query.is(column, null)
        : query.eq(column, value);
    }

    const { data, error } = await query.select();

    if (error) throw error;

    return data;
  }

  window.NekkoAPI = Object.freeze({
    selectOne,
    selectMany,
    insertOne,
    updateRows,
    deleteRows
  });
})();
