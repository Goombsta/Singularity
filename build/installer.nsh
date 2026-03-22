; Singularity — custom NSIS installer logic
; Detects an existing installation and offers Upgrade or Uninstall-first options.
; Runs before any installer UI is shown (customInit macro).

!macro customInit
  ; Check HKCU first (per-user install), then HKLM (per-machine install)
  ReadRegStr $R0 HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
    "UninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
      "UninstallString"
  ${EndIf}

  ${If} $R0 != ""
    ; Read the installed version number for the prompt message
    ReadRegStr $R1 HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
      "DisplayVersion"
    ${If} $R1 == ""
      ReadRegStr $R1 HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
        "DisplayVersion"
    ${EndIf}

    ; Ask the user what to do
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Singularity $R1 is already installed.$\n$\n\
Would you like to uninstall the previous version first?$\n$\n\
  Yes  —  Remove old version, then install fresh (recommended)$\n\
  No   —  Upgrade in place (keeps all your playlists and settings)" \
      IDNO singularity_skip_uninstall

    ; Strip surrounding quotes from UninstallString if present
    StrCpy $R2 $R0 1
    ${If} $R2 == '"'
      StrCpy $R0 $R0 "" 1
      StrCpy $R2 $R0 1 -1
      ${If} $R2 == '"'
        StrCpy $R0 $R0 -1
      ${EndIf}
    ${EndIf}

    ; Run the old uninstaller silently and wait for it to finish
    ExecWait '"$R0" /S'
    Sleep 1500

    singularity_skip_uninstall:
  ${EndIf}
!macroend
