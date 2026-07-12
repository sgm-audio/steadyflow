#!/bin/bash
# SteadyFlow dev launcher — starts everything needed for local development.
# Usage: bash scripts/dev.sh

set -euo pipefail

echo "=== SteadyFlow Dev Launcher ==="

# 1. Start supabase if not already running
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q supabase_db_steadyflow; then
  echo "[ok] supabase already running"
else
  echo "[starting] supabase..."
  supabase start
  sleep 2
  # Fix SELinux labels (Bazzite/Fedora Atomic)
  if command -v chcon &>/dev/null; then
    sudo chcon -Rt container_file_t -l s0 "$(pwd)/supabase/functions" 2>/dev/null || true
  fi
  # Ensure grants survived db restore
  docker exec supabase_db_steadyflow psql -U supabase_admin -d postgres \
    -c "GRANT INSERT ON public.audit_log TO authenticated;" \
    -c "GRANT EXECUTE ON FUNCTION public.rate_limit_take(uuid, uuid, text, integer, numeric) TO authenticated;" \
    2>/dev/null || true
  echo "[ok] supabase ready"
fi

# 2. Print connection info
SUPABASE_URL=$(docker exec supabase_db_steadyflow psql -U supabase_admin -d postgres -c "SHOW server_version;" 2>/dev/null | head -3)
echo ""
echo "=== Login ==="
echo "  Email:    dev@steadyflow.local"
echo "  Password: admin"
echo "  Studio:   http://127.0.0.1:54323"
echo ""
echo "=== Commands ==="
echo "  Web app:   pnpm --filter @steadyflow/web dev"
echo "  Workers:   pnpm --filter @steadyflow/edge worker:loop"
echo "  Extension: pnpm --filter @steadyflow/extension dev"
echo "  Tests:     pnpm test"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

# 3. Start worker loop in background (processes intents from pgmq)
echo "[starting] worker loop (background)..."
pnpm --filter @steadyflow/edge worker:loop &
WORKER_PID=$!
echo "  worker PID: $WORKER_PID"

# 4. Start extension dev build in background (crxjs, watches + HMR)
echo "[starting] extension dev build (background)..."
pnpm --filter @steadyflow/extension dev &
EXTENSION_PID=$!
echo "  extension PID: $EXTENSION_PID"

trap "kill $WORKER_PID $EXTENSION_PID 2>/dev/null; exit" EXIT INT TERM

# 5. Start the web app (foreground -- Ctrl+C here stops everything above too)
pnpm --filter @steadyflow/web dev
