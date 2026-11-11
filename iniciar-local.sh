#!/usr/bin/env bash
# Sobe back-end e front-end juntos (Linux/macOS/Git Bash). Ctrl+C encerra os dois.
set -e
cd "$(dirname "$0")"

if [ ! -d backend/.venv ]; then
  echo "[backend] criando ambiente virtual e instalando dependencias..."
  python3 -m venv backend/.venv
  if [ -f backend/.venv/bin/python ]; then PY=backend/.venv/bin/python; else PY=backend/.venv/Scripts/python; fi
  "$PY" -m pip install -q -r backend/requirements.txt
fi
if [ -f backend/.venv/bin/python ]; then PY=backend/.venv/bin/python; else PY=backend/.venv/Scripts/python; fi

if [ ! -f backend/.env ]; then
  "$PY" -c "import secrets;print('JWT_SECRET='+secrets.token_urlsafe(48));print('FRONTEND_URL=http://localhost:5173')" > backend/.env
fi
[ -d frontend/node_modules ] || (cd frontend && npm install)
[ -f frontend/.env ] || echo "VITE_API_URL=/backend" > frontend/.env

trap 'kill 0' EXIT
(cd backend && "../$PY" -m uvicorn app.main:app --reload --port 3333) &
(cd frontend && npm run dev) &
echo "Back: http://localhost:3333/docs  |  Front: http://localhost:5173"
wait
