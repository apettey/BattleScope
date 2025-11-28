#!/bin/sh
set -e

echo "Running database migrations..."
node dist/database/migrate-cli.js

echo "Starting ingestion service..."
exec node dist/index.js
