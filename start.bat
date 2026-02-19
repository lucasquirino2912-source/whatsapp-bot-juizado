@echo off
REM Script para iniciar o WhatsApp Bot em Windows

echo.
echo =====================================================
echo.  WhatsApp Bot - Startup Script (Windows)
echo.
echo =====================================================
echo.

REM Verificar se Node.js está instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado. Instale Node.js primeiro.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js encontrado: %NODE_VERSION%

REM Verificar se PM2 está instalado
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] PM2 nao encontrado. Instalando globalmente...
    call npm install -g pm2
)

for /f "tokens=*" %%i in ('pm2 --version') do set PM2_VERSION=%%i
echo [OK] PM2 encontrado: %PM2_VERSION%

REM Instalar dependências se necessário
if not exist "node_modules" (
    echo [AVISO] Instalando dependencias...
    call npm install
)

REM Criar pasta de logs
if not exist "logs" mkdir logs

REM Iniciar bot com PM2
echo [INFO] Iniciando bot com PM2...
call pm2 start ecosystem.config.js

REM Mostrar status
echo.
echo =====================================================
echo.
call pm2 status
echo.
echo [OK] Bot iniciado com sucesso!
echo [INFO] Health Check: http://localhost:3000/health
echo [INFO] Status: http://localhost:3000/status
echo.
echo Para ver logs em tempo real:
echo   pm2 logs whatsapp-bot
echo.
pause
