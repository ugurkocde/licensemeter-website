# Contributing

Use Node.js 24 and the setup in [README.md](README.md). Keep changes focused. Report bugs with reproduction steps and the revision, using synthetic data and redacted logs.

```bash
npm ci
npm run format:check
npm run check
npm test
npm run test:docker
npm run build
npm run test:e2e
```

Builds and browser tests need `.env.example` configuration. CI uses throwaway values and isolated databases. Never test against the hosted database.

## Schema changes

The source is `src/server/db/schema.ts`. Docker uses committed migrations in `docker/migrations`:

```bash
npm run db:generate -- --name describe_your_change
```

CI regenerates migrations from the schema and fails when `docker/migrations` would change, so commit the generated files with the schema change. Review the SQL for data preservation and indexes. Test both a fresh database and an upgrade from the previous schema. Do not edit released migrations or auto-approve destructive pushes. Hosted database changes have a separate operator-managed process.

## Security and assets

Follow [SECURITY.md](SECURITY.md). Add no production secrets, deployment-specific account IDs, private notes, or screenshots of customer data. Preserve third-party asset notices and attribution.
