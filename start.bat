@echo off
title Faust Lawn Maintenance
echo ==========================================
echo   Faust Lawn Maintenance
echo ==========================================
echo.

:: Generate TLS certificate if needed
if not exist "certs\cert.pem" (
    echo [1/3] Generating self-signed TLS certificate...
    cd backend
    python generate_cert.py
    cd ..
    echo.
) else (
    echo [1/3] TLS certificate found.
)

:: Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
:found_ip
set LOCAL_IP=%LOCAL_IP: =%

echo.
echo [2/3] Starting backend (FastAPI)...
start "Faust Backend" cmd /k "cd backend && python run.py"

echo [3/3] Starting frontend (Vite)...
timeout /t 3 /nobreak > nul
start "Faust Frontend" cmd /k "cd frontend && npm run dev -- --host"

echo.
echo ==========================================
echo   Faust Lawn Maintenance is running!
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000
echo.
echo   LAN Access: http://%LOCAL_IP%:5173
echo ==========================================
echo.
pause
