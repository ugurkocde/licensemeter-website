#!/bin/sh
set -eu
# Runs once on an empty volume. Password interpolation is handled by psql's
# quoted SQL-literal syntax, never string-concatenated into a statement.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
  --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE licensemeter_app LOGIN PASSWORD :'app_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE licensemeter TO licensemeter_app;
GRANT USAGE ON SCHEMA public TO licensemeter_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO licensemeter_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO licensemeter_app;
SQL
