#!/bin/bash
# First-start only: roles and the three databases, BEFORE any dump is restored.
#
# pg_dump from Supabase carries GRANT/REVOKE statements naming anon,
# authenticated and service_role; restoring without them fails on every one.
# Roles are cluster-wide in Postgres, so the three are shared — isolation comes
# from a separate login role per database, each allowed to CONNECT only to its
# own, and a separate JWT secret per PostgREST.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
    CREATE ROLE anon          NOLOGIN NOINHERIT;
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
    CREATE ROLE service_role  NOLOGIN NOINHERIT BYPASSRLS;
SQL

make_db() {
    local db="$1" password="$2"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
        CREATE ROLE authenticator_${db} LOGIN NOINHERIT PASSWORD '${password}';
        GRANT anon, authenticated, service_role TO authenticator_${db};
        CREATE DATABASE ${db};
        REVOKE CONNECT ON DATABASE ${db} FROM PUBLIC;
        GRANT CONNECT ON DATABASE ${db} TO authenticator_${db};
SQL
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-SQL
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
}

make_db leelah  "$LEELAH_AUTHENTICATOR_PASSWORD"
make_db tickets "$TICKETS_AUTHENTICATOR_PASSWORD"
make_db murashki   "$MURASHKI_AUTHENTICATOR_PASSWORD"

# Storage API keeps its object index in schema `storage` of the tickets
# database and runs its own migrations there on start.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname tickets <<-SQL
    CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE
        PASSWORD '${TICKETS_STORAGE_PASSWORD}';
    GRANT anon, authenticated, service_role TO supabase_storage_admin;
    GRANT CONNECT, CREATE ON DATABASE tickets TO supabase_storage_admin;
    CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    ALTER ROLE supabase_storage_admin SET search_path = storage;
SQL
