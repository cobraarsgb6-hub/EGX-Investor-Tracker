@echo off
chcp 65001 >nul
echo 🛑 إيقاف خادم لوحة تحكم البورصة المصرية...
taskkill /f /im python.exe /fi "WINDOWTITLE eq app.py*" 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5050') do (
    taskkill /f /pid %%a 2>nul
)
echo ✅ تم إيقاف السيرفر بنجاح.
timeout /t 2 >nul
