@echo off
chcp 65001 > nul
title EGX Investor Tracker CLI
cd /d "%~dp0"
echo ========================================================
echo   سحب فوري لتعاملات فئات المستثمرين بالجنيه والدولار
echo ========================================================
echo.
python cli.py
echo.
pause
