#!/bin/bash

set -euo pipefail

echo "Running CLI application..."

cd "$(dirname "$0")/.."
node backend/cli.js demo > scripts/result.txt

echo "CLI application execution completed"
