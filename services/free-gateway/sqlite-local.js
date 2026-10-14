import { DatabaseSync } from "node:sqlite";

// Adapts Node's SQLite to the same synchronous SQL/transaction contract used by
// Cloudflare. The Node server/mock/test process owns this database and closes it.
export function openLocalQuotaStorage(path = ":memory:") {
  const database = new DatabaseSync(path);
  return {
    sql: {
      exec(query, ...bindings) {
        const statement = database.prepare(query);
        const rows = statement.columns().length ? statement.all(...bindings) : [];
        if (!statement.columns().length) {
          statement.run(...bindings);
        }
        return { toArray: () => rows };
      },
    },
    transactionSync(callback) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = callback();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => database.close(),
  };
}
