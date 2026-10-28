# Review PostgreSQL changes

Use this checklist for PostgreSQL SQL and its application callers.
Read the repo's migration and access rules first.
Keep all database checks on the task's isolated test database.

## Data and access

- Trace tenant and ownership keys through reads, inserts, updates, and deletes.
- Check constraints, null behavior, foreign keys, and uniqueness against the required invariant.
- Inspect both visible-row and writable-row policy expressions.
- Test each affected role, including a rejected cross-tenant operation.
- Inspect function grants and any `SECURITY DEFINER` execution context.
- Review the function's search path and every unqualified object it uses.

Table owners normally bypass row security.
A superuser or `BYPASSRLS` role also bypasses it.
Use an application role when testing access restrictions.
See [the row security reference](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

A `SECURITY DEFINER` function runs with its owner's privileges.
Its search path must exclude schemas writable by untrusted callers.
See [the function reference](https://www.postgresql.org/docs/current/sql-createfunction.html).

## Transactions and migrations

- Trace the invariant across the transaction's reads and writes.
- Exercise competing operations when isolation or locking carries the invariant.
- Check lock order, statement time limits, and failure rollback.
- Check upgrade order against old and new callers.
- Measure backfills and index work with representative local data.
- Do not reset a retained database to make a migration pass.

Read Committed can observe different committed data in successive statements.
Use the actual isolation level when testing a concurrent scenario.
See [the transaction isolation reference](https://www.postgresql.org/docs/current/transaction-iso.html).

`CREATE INDEX CONCURRENTLY` has extra work and transaction restrictions.
Check whether the repo's migration runner can execute it.
See [the index reference](https://www.postgresql.org/docs/current/sql-createindex.html).

## Query evidence

Inspect a representative query plan before claiming an index fixes performance.
`EXPLAIN ANALYZE` executes its statement, so keep it on the isolated test database.
See [the query-plan reference](https://www.postgresql.org/docs/current/using-explain.html).

Report the failing operation, changed line, wrong result, role, and evidence.
Name any role, migration path, or concurrent schedule that you did not test.
