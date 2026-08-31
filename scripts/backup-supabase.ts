/** Local backup of the remote Supabase database for StuffSearch.
 *
 * Writes backups/backup-<timestamp>/ containing:
 *   - data.json            every row of every public table + auth.users rows
 *                          (incl. password hashes when dumped via the
 *                          Management API; keep this file private)
 *   - data.sql             plain INSERT statements + sequence resets, restorable
 *                          with psql after supabase/migrations are applied
 *   - schema_snapshot.json live DDL facts (columns, constraints, indexes, RLS
 *                          policies, triggers, functions) to detect drift
 *                          against supabase/migrations
 *   - storage/<bucket>/... every object of every non-empty bucket, downloaded
 *                          via public URLs (management mode only), verified
 *                          against the size recorded in storage.objects
 *   - manifest.json        row counts + storage summary + metadata
 *
 * Two collection modes, tried in order:
 *   1. management — Supabase Management API /database/query with a platform
 *      access token (env SUPABASE_ACCESS_TOKEN, else the token ZCode's MCP
 *      server uses in .zcode/config.json). Full admin read incl. auth schema
 *      + storage object listing.
 *   2. rest — PostgREST + auth admin API with SUPABASE_SERVICE_ROLE_KEY from
 *      .env (no auth password hashes; no storage download).
 *
 * Never commit the output — backups/ is gitignored. Pure SQL rendering and
 * storage-path helpers live in src/lib/backup.ts (unit-tested there).
 *
 * Run: npm run backup   (or: npx -y tsx scripts/backup-supabase.ts)
 */
import { createClient, type User } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  insertStatements,
  publicStorageObjectUrl,
  quoteIdent,
  safeStoragePath,
  sequenceReset,
  sqlLiteral,
  tableColumns,
} from '../src/lib/backup';

type Row = Record<string, unknown>;

interface Dump {
  mode: 'management' | 'rest';
  tableNames: string[];
  tableRows: Record<string, Row[]>;
  authUsers: Row[];
  /** Tables that have an `id` column (candidates for sequence resets). */
  idColumnTables: Set<string>;
  schemaSnapshot: unknown;
}

const PAGE_SIZE = 1000;

function loadEnvFile(file: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[match[1]] = value;
  }
  return vars;
}

function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

// ---------------------------------------------------------------- management

interface ManagementAccess {
  token: string;
  ref: string;
}

/** Token resolution: env wins, else the PAT ZCode's own Supabase MCP server
 * uses (.zcode/config.json) so there is exactly one credential on disk. */
function findManagementAccess(env: Record<string, string>): ManagementAccess | null {
  let token: string | undefined = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    try {
      const zcode = JSON.parse(
        readFileSync(path.resolve(__dirname, '..', '.zcode', 'config.json'), 'utf8')
      ) as { mcp?: { servers?: Record<string, { env?: Record<string, string> }> } };
      token = zcode.mcp?.servers?.supabase?.env?.SUPABASE_ACCESS_TOKEN;
    } catch {
      // no .zcode/config.json — fall through to REST mode
    }
  }
  if (!token) return null;
  const ref =
    env.SUPABASE_PROJECT_ID ??
    (env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/^https?:\/\//, '').split('.')[0];
  if (!ref) return null;
  return { token, ref };
}

async function mgmtQuery(access: ManagementAccess, sql: string): Promise<Row[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${access.ref}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    throw new Error(`Management API query failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  // Endpoint returns an array of row objects; rows are JSON, never strings.
  return (await res.json()) as Row[];
}

const SCHEMA_SNAPSHOT_SQL = `
select jsonb_build_object(
  'columns', (select coalesce(jsonb_agg(jsonb_build_object(
        'table', table_name, 'column', column_name, 'type', data_type,
        'udt', udt_name, 'nullable', is_nullable, 'default', column_default)
      order by table_name, ordinal_position), '[]'::jsonb)
    from information_schema.columns where table_schema = 'public'),
  'constraints', (select coalesce(jsonb_agg(jsonb_build_object(
        'table', conrelid::regclass::text, 'name', conname, 'def', pg_get_constraintdef(c.oid))
      order by conrelid::regclass::text, conname), '[]'::jsonb)
    from pg_constraint c where connamespace = 'public'::regnamespace),
  'indexes', (select coalesce(jsonb_agg(jsonb_build_object(
        'table', tablename, 'name', indexname, 'def', indexdef)
      order by tablename, indexname), '[]'::jsonb)
    from pg_indexes where schemaname = 'public'),
  'policies', (select coalesce(jsonb_agg(to_jsonb(p) order by tablename, policyname), '[]'::jsonb)
    from pg_policies p where schemaname = 'public'),
  'triggers', (select coalesce(jsonb_agg(pg_get_triggerdef(t.oid) order by t.oid::text), '[]'::jsonb)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public'),
  'functions', (select coalesce(jsonb_agg(pg_get_functiondef(p.oid) order by p.oid::text), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f')
) as schema;`;

async function collectViaManagement(
  env: Record<string, string>
): Promise<Dump> {
  const access = findManagementAccess(env);
  if (!access) throw new Error('No Management API access token available.');

  const nameRows = await mgmtQuery(
    access,
    `select tablename from pg_tables where schemaname = 'public' order by tablename`
  );
  const tableNames = nameRows.map((r) => String(r.tablename));
  if (tableNames.length === 0) throw new Error('No tables found in public schema.');

  const tableSql = tableNames
    .map((t) => `${sqlLiteral(t)}, (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.${quoteIdent(t)} r)`)
    .join(', ');
  const dump = ((await mgmtQuery(access, `select jsonb_build_object(${tableSql}) as dump`))[0]
    .dump ?? {}) as Record<string, Row[] | null>;
  const tableRows: Record<string, Row[]> = {};
  for (const t of tableNames) tableRows[t] = dump[t] ?? [];

  // Self-verify: exact live counts must match the dumped row counts.
  const countSql = tableNames
    .map((t) => `${sqlLiteral(t)}, (select count(*) from public.${quoteIdent(t)})`)
    .join(', ');
  const counts = ((await mgmtQuery(access, `select jsonb_build_object(${countSql}) as counts`))[0]
    .counts ?? {}) as Record<string, number>;
  for (const t of tableNames) {
    if (Number(counts[t]) !== tableRows[t].length) {
      throw new Error(`Row count mismatch for ${t}: live ${counts[t]}, dumped ${tableRows[t].length}`);
    }
  }

  const schemaSnapshot = (await mgmtQuery(access, SCHEMA_SNAPSHOT_SQL))[0].schema;
  const columns = ((schemaSnapshot as Row)?.columns ?? []) as Row[];
  const idColumnTables = new Set(
    columns.filter((c) => c.column === 'id').map((c) => String(c.table))
  );

  const authUsers = (((await mgmtQuery(
    access,
    `select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) as users from auth.users u`
  ))[0].users ?? []) as Row[]);

  return { mode: 'management', tableNames, tableRows, authUsers, idColumnTables, schemaSnapshot };
}

// --------------------------------------------------------------------- rest

interface OpenApiSpec {
  definitions?: Record<string, { properties?: Record<string, unknown> }>;
  components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
}

async function collectViaRest(url: string, key: string): Promise<Dump> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`OpenAPI request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  // PostgREST emits swagger 2.0 (`definitions`) or OpenAPI 3 (`components.schemas`)
  // depending on version; both map table name -> { properties: { col: ... } }.
  const spec = (await res.json()) as OpenApiSpec;
  const tableSpecs = spec.definitions ?? spec.components?.schemas ?? {};
  const tableNames = Object.keys(tableSpecs).sort();
  if (tableNames.length === 0) throw new Error('No tables found in OpenAPI spec.');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const tableRows: Record<string, Row[]> = {};
  const idColumnTables = new Set<string>();

  for (const table of tableNames) {
    const head = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (head.error) throw new Error(`Count failed for ${table}: ${head.error.message}`);

    const rows: Row[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await supabase.from(table).select('*').range(offset, offset + PAGE_SIZE - 1);
      if (page.error) throw new Error(`Fetch failed for ${table}: ${page.error.message}`);
      const data = (page.data ?? []) as Row[];
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    if ((head.count ?? rows.length) !== rows.length) {
      throw new Error(`Row count mismatch for ${table}: live ${head.count}, dumped ${rows.length}`);
    }
    tableRows[table] = rows;
    if ('id' in (tableSpecs[table].properties ?? {})) idColumnTables.add(table);
    console.log(`  ${table.padEnd(24)} ${String(rows.length).padStart(6)} rows`);
  }

  // Auth admin API never returns password hashes — noted in the manifest.
  const authUsers: User[] = [];
  for (let page = 1; ; page++) {
    const r = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (r.error) throw new Error(`Listing auth users failed: ${r.error.message}`);
    authUsers.push(...r.data.users);
    if (r.data.users.length < 200) break;
  }

  return {
    mode: 'rest',
    tableNames,
    tableRows,
    // User has no index signature; we only serialize these objects as JSON.
    authUsers: authUsers as unknown as Row[],
    idColumnTables,
    schemaSnapshot: { openapiTables: tableSpecs },
  };
}

// ------------------------------------------------------------------ storage

const DOWNLOAD_CONCURRENCY = 4;

interface StorageSummary {
  [bucket: string]: { objects: number; bytes: number };
}

/** Download every object of every non-empty bucket into outDir/storage/.
 * Sizes are verified against storage.objects metadata; any mismatch or HTTP
 * error fails the backup. Public buckets only — signing URLs for private ones
 * would need a valid service-role key. */
async function backupStorage(
  access: ManagementAccess,
  url: string,
  outDir: string
): Promise<StorageSummary> {
  const summary: StorageSummary = {};
  const bucketRows = await mgmtQuery(
    access,
    `select id, public from storage.buckets order by id`
  );

  for (const bucket of bucketRows) {
    const bucketId = String(bucket.id);
    const objects = await mgmtQuery(
      access,
      `select name, metadata from storage.objects where bucket_id = ${sqlLiteral(bucketId)} order by name`
    );
    if (objects.length === 0) continue;
    if (!bucket.public) {
      throw new Error(
        `Bucket "${bucketId}" is private — cannot download via public URLs (needs a valid service key).`
      );
    }

    let next = 0;
    let bytes = 0;
    const worker = async (): Promise<void> => {
      while (next < objects.length) {
        const obj = objects[next++];
        const name = String(obj.name);
        const rel = safeStoragePath(name);
        const res = await fetch(publicStorageObjectUrl(url, bucketId, name));
        if (!res.ok) {
          throw new Error(`Download failed for ${bucketId}/${name}: ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const expected = Number((obj.metadata as Row | null)?.size ?? -1);
        if (expected >= 0 && buf.length !== expected) {
          throw new Error(
            `Size mismatch for ${bucketId}/${name}: expected ${expected}, got ${buf.length}`
          );
        }
        const dest = path.join(outDir, 'storage', safeStoragePath(bucketId), rel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, buf);
        bytes += buf.length;
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, objects.length) }, worker)
    );

    summary[bucketId] = { objects: objects.length, bytes };
    console.log(
      `  storage/${bucketId.padEnd(16)} ${String(objects.length).padStart(6)} objects, ${bytes} bytes`
    );
  }
  return summary;
}

// ------------------------------------------------------------------- render

async function main(): Promise<void> {
  const env = loadEnvFile(path.resolve(__dirname, '..', '.env'));
  const url = env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL in .env.');

  const access = findManagementAccess(env);
  console.log(`Mode: ${access ? 'management API' : 'REST (service-role key)'}`);
  const dump = access
    ? await collectViaManagement(env)
    : await collectViaRest(url, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

  const generatedAt = new Date();
  const outDir = path.resolve(__dirname, '..', 'backups', `backup-${timestamp(generatedAt)}`);
  await fs.mkdir(outDir, { recursive: true });

  const data = {
    meta: { generatedAt: generatedAt.toISOString(), projectUrl: url, mode: dump.mode },
    tables: Object.fromEntries(
      dump.tableNames.map((t) => [t, { columns: tableColumns(dump.tableRows[t]), rows: dump.tableRows[t] }])
    ),
    authUsers: dump.authUsers,
  };
  await fs.writeFile(path.join(outDir, 'data.json'), JSON.stringify(data, null, 2), 'utf8');

  const sqlParts = [
    `-- StuffSearch database backup (data only)`,
    `-- Generated: ${generatedAt.toISOString()}`,
    `-- Project:   ${url}`,
    `-- Restore:   apply supabase/migrations, then run this file with psql.`,
    `-- Auth users live in data.json only (auth schema layout is`,
    `-- Supabase-version-specific; import them separately if needed).`,
    `SET standard_conforming_strings = on;`,
    ``,
  ];
  for (const table of dump.tableNames) {
    const qualified = `public.${table}`;
    const columns = tableColumns(dump.tableRows[table]);
    sqlParts.push(
      `-- ${table} (${dump.tableRows[table].length} rows)`,
      ...insertStatements(qualified, columns, dump.tableRows[table])
    );
    if (dump.idColumnTables.has(table)) {
      // No-op for uuid / non-serial ids via the NULL-safe DO block inside.
      sqlParts.push(sequenceReset(qualified, 'id'));
    }
    sqlParts.push(``);
  }
  await fs.writeFile(path.join(outDir, 'data.sql'), sqlParts.join('\n'), 'utf8');

  await fs.writeFile(
    path.join(outDir, 'schema_snapshot.json'),
    JSON.stringify({ generatedAt: generatedAt.toISOString(), schema: dump.schemaSnapshot }, null, 2),
    'utf8'
  );

  console.log('Storage:');
  const storageSummary =
    dump.mode === 'management' && access
      ? await backupStorage(access, url, outDir)
      : (console.log('  skipped — storage download needs the Management API token'), {});
  if (Object.keys(storageSummary).length === 0 && dump.mode === 'management') {
    console.log('  no objects found in any bucket');
  }

  const tableCounts = Object.fromEntries(
    dump.tableNames.map((t) => [t, dump.tableRows[t].length])
  );
  const manifest = {
    generatedAt: generatedAt.toISOString(),
    projectUrl: url,
    mode: dump.mode,
    tableCounts,
    storage: storageSummary,
    authUserCount: dump.authUsers.length,
    totalRows: Object.values(tableCounts).reduce((a, b) => a + b, 0),
    authIncludesPasswordHashes: dump.mode === 'management',
  };
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  for (const t of dump.tableNames) {
    console.log(`  ${t.padEnd(24)} ${String(tableCounts[t]).padStart(6)} rows`);
  }
  console.log(`\nBackup complete: ${outDir}`);
  console.log(
    `Tables: ${dump.tableNames.length}, rows: ${manifest.totalRows}, auth users: ${dump.authUsers.length}`
  );
}

main().catch((err: unknown) => {
  console.error(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
