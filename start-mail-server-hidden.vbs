Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")

folder = files.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder
nodeCmd = "node"
If files.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeCmd = """C:\Program Files\nodejs\node.exe"""
End If
shell.Run nodeCmd & " server.js", 0, False
