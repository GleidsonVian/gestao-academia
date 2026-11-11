@echo off
setlocal
cd /d "%~dp0"
title Gestao de Academias - launcher (ngrok)

echo ==============================================
echo   Gestao de Academias - modo TESTE com ngrok
echo ==============================================

where ngrok >nul 2>nul || (echo [ERRO] ngrok nao encontrado. Instale em ngrok.com/download e rode: ngrok config add-authtoken SEU_TOKEN & pause & exit /b 1)

rem sobe back-end e front-end (mesma rotina do iniciar-local.bat, sem abrir o navegador)
call "%~dp0iniciar-local.bat" nobrowser

echo.
echo [ngrok] abrindo o tunel para a porta 5173...
start "Tunel - ngrok" cmd /k "ngrok http 5173"

powershell -NoProfile -Command "$u=$null; for($i=0;$i -lt 25 -and -not $u;$i++){ try { $u=(Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels[0].public_url } catch {}; if(-not $u){Start-Sleep 1} }; if($u){ Set-Clipboard $u; Write-Host ''; Write-Host ('LINK PUBLICO: ' + $u) -ForegroundColor Green; Write-Host '(copiado para a area de transferencia)'; Start-Process $u } else { Write-Host 'Nao consegui ler o link do ngrok. Veja a janela Tunel - ngrok.' -ForegroundColor Yellow }"

echo.
echo ATENCAO: qualquer pessoa com esse link acessa o app. Use so para teste e com dados ficticios.
echo Na primeira visita o ngrok mostra um aviso: toque em Visit Site.
echo Para parar, feche as janelas Backend, Frontend e Tunel.
pause
endlocal
