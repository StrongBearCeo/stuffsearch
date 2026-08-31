/** Pure helpers for rendering database rows as restorable SQL text.
 * Used by scripts/backup-supabase.ts to produce data.sql from a REST dump.
 * Keep this module free of I/O so it stays unit-testable. */

/** Double-quote a single SQL identifier, escaping embedded quotes. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quote a dot-qualified relation name like `public.items`. */
export function quoteQualifiedTable(table: string): string {
  return table.split('.').map(quoteIdent).join('.');
}

/** Render a JavaScript value (as returned by the REST API) as a SQL literal.
 *  - null/undefined -> NULL
 *  - boolean        -> TRUE / FALSE
 *  - finite number  -> numeric literal
 *  - string         -> single-quoted, '' doubling (standard_conforming_strings on)
 *  - object/array   -> jsonb/json document literal
 *  - Date           -> ISO 8601 timestamp literal
 * Throws on non-finite numbers so corrupted data fails loudly, not silently. */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite number: ${value}`);
    }
    return String(value);
  }
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

/** Deterministic column list for a set of rows: sorted union of all keys. */
export function tableColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys].sort();
}

/** One INSERT statement per row (robust to partial restores, unlike one
 * multi-row statement). Returns [] for zero rows. */
export function insertStatements(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[]
): string[] {
  const target = quoteQualifiedTable(table);
  const columnList = columns.map(quoteIdent).join(', ');
  return rows.map((row) => {
    const values = columns.map((c) => sqlLiteral(row[c])).join(', ');
    return `INSERT INTO ${target} (${columnList}) VALUES (${values});`;
  });
}

/** Reset a table's id sequence to max(id) after an explicit-id restore.
 * Wrapped in a DO block because pg_get_serial_sequence returns NULL for
 * non-serial / uuid primary keys, and setval(NULL, ...) would error. */
export function sequenceReset(table: string, idColumn: string): string {
  const t = quoteQualifiedTable(table);
  const c = quoteIdent(idColumn);
  return [
    'DO $$',
    'DECLARE seq text;',
    'BEGIN',
    `  seq := pg_get_serial_sequence('${table}', '${idColumn}');`,
    '  IF seq IS NOT NULL THEN',
    `    PERFORM setval(seq, COALESCE((SELECT max(${c}) FROM ${t}), 1), true);`,
    '  END IF;',
    'END $$;',
  ].join('\n');
}

/** Local relative path for a storage object name like `user/hh/items/a.jpeg`.
 * Rejects traversal / empty segments so an object name can never escape the
 * backup directory. */
export function safeStoragePath(name: string): string {
  const parts = name.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      throw new Error(`Unsafe storage object name: ${name}`);
    }
  }
  if (parts.some((p) => /["\\\0<>:|?*]/.test(p))) {
    throw new Error(`Storage object name has filesystem-hostile characters: ${name}`);
  }
  return parts.join('/');
}

/** Public URL for a storage object, URL-encoding each path segment (keeps `/`
 * separators intact). Only valid for objects in public buckets. */
export function publicStorageObjectUrl(
  projectUrl: string,
  bucket: string,
  name: string
): string {
  const base = projectUrl.replace(/\/+$/, '');
  const objectPath = name.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
}
