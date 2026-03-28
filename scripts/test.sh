#!/bin/bash

set -euo pipefail

echo "Running unit tests..."

cd "$(dirname "$0")/.."
node --test backend/tests/*.test.js

echo "Unit tests completed"
