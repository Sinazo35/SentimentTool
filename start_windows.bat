@echo off
cd /d "%~dp0"
py -m pip install -r requirements.txt
if errorlevel 1 (echo Installation failed. Check Python installation. & pause & exit /b 1)
start http://127.0.0.1:5000
py app.py
pause
