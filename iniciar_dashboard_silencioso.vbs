' Lanzador silencioso de la aplicación de escritorio nativa (sin ventana de consola)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "pythonw server.py", 0, False
