#!/bin/bash

set -euo pipefail

echo "Building CLI application..."

cd "$(dirname "$0")/.."
node --check backend/clock.js
node --check backend/order-controller.js
node --check backend/server.js
node --check backend/cli.js

echo "Build completed"
