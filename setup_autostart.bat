@echo off
chcp 65001 >nul
echo ========================================================
echo 🚀 تفعيل التشغيل التلقائي لسيرفر البورصة في خلفية الويندوز
echo ========================================================

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\EGX_Tracker_Silent.vbs"
set "TARGET_VBS=C:\Users\co0ob\Projects\EGX-Investor-Tracker\run_silent.vbs"

copy /y "%TARGET_VBS%" "%SHORTCUT_PATH%" >nul

echo.
echo ✅ تم التثبيت بنجاح في مجلد بدء تشغيل الويندوز!
echo 📌 سيعمل السيرفر تلقائياً في الخلفية وبشكل صامت تماماً فور تشغيل الكمبيوتر.
echo 🌐 يمكنك فتح الرابط مباشرة في المتصفح في أي وقت: http://127.0.0.1:5050
echo.
pause
