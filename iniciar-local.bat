@echo off
setlocal
cd /d "%~dp0"
title Gestao de Academias - launcher

echo ==============================================
echo   Gestao de Academias - iniciando back e front
echo ==============================================

where python >nul 2>nul || (echo [ERRO] Python nao encontrado. Instale em python.org & pause & exit /b 1)
where npm >nul 2>nul || (echo [ERRO] Node.js/npm nao encontrado. Instale em nodejs.org & pause & exit /b 1)

rem ---------- back-end: ambiente virtual e dependencias (so na 1a vez) ----------
if not exist "backend\.venv\Scripts\python.exe" (
  echo [backend] criando ambiente virtual...
  python -m venv backend\.venv || (echo [ERRO] falha ao criar o venv & pause & exit /b 1)
  echo [backend] instalando dependencias...
  backend\.venv\Scripts\python -m pip install -q -r backend\requirements.txt || (echo [ERRO] falha ao instalar dependencias & pause & exit /b 1)
)

rem ---------- back-end: .env com segredo JWT aleatorio (so na 1a vez) ----------
if not exist "backend\.env" (
  echo [backend] criando backend\.env com JWT_SECRET aleatorio...
  backend\.venv\Scripts\python -c "import secrets;print('JWT_SECRET='+secrets.token_urlsafe(48));print('FRONTEND_URL=http://localhost:5173')" > backend\.env
)

rem ---------- front-end: dependencias e .env (so na 1a vez) ----------
if not exist "frontend\node_modules" (
  echo [frontend] instalando dependencias...
  pushd frontend
  call npm install || (echo [ERRO] falha no npm install & popd & pause & exit /b 1)
  popd
)
if not exist "frontend\.env" echo VITE_API_URL=/backend> frontend\.env

rem ---------- sobe os dois em janelas separadas ----------
echo [backend] http://localhost:3333   (docs: /docs)
start "Backend - FastAPI" /D "%~dp0backend" cmd /k ".venv\Scripts\python -m uvicorn app.main:app --reload --port 3333"

echo [frontend] http://localhost:5173
start "Frontend - Vite" /D "%~dp0frontend" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul
if /i not "%~1"=="nobrowser" start "" http://localhost:5173

echo.
echo Pronto. Para parar, feche as duas janelas (Backend e Frontend).
echo Dados de exemplo (opcional): cd backend ^&^& .venv\Scripts\python seed.py
endlocal
