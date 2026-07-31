SELECT 'CREATE DATABASE qhse_shadow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'qhse_shadow')
\gexec

\connect qhse_shadow

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
