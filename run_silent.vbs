Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\co0ob\Projects\EGX-Investor-Tracker"
WshShell.Run "python app.py", 0, False
