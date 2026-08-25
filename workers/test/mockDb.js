/**
 * Native Node 24 SQLite Mock D1 Database Wrapper for SaaS Testing.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export function createMockSaaSDb() {
  const memDb = new DatabaseSync(':memory:');

  const schemaPath = path.resolve(__dirname, '../../schema/0001_initial_schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  memDb.exec(sql);

  return {
    prepare(query) {
      let params = [];

      return {
        bind(...args) {
          params = args.map(a => (a === undefined ? null : a));
          return this;
        },

        async run() {
          try {
            const stmt = memDb.prepare(query);
            const result = stmt.run(...params);
            return {
              success: true,
              meta: {
                changes: result.changes,
                last_row_id: Number(result.lastInsertRowid)
              }
            };
          } catch (err) {
            throw err;
          }
        },

        async first() {
          try {
            const stmt = memDb.prepare(query);
            const row = stmt.get(...params);
            return row || null;
          } catch (err) {
            throw err;
          }
        },

        async all() {
          try {
            const stmt = memDb.prepare(query);
            const rows = stmt.all(...params);
            return {
              results: rows || [],
              success: true
            };
          } catch (err) {
            throw err;
          }
        }
      };
    }
  };
}
