#!/bin/sh
set -e

# Generate runtime config file with environment variables
cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  API_BASE_URL: "${VITE_API_BASE_URL:-http://localhost:3000}"
};
EOF

echo "Generated runtime config with API_BASE_URL=${VITE_API_BASE_URL:-http://localhost:3000}"

# Execute the main nginx command
exec "$@"
