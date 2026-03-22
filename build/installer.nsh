; Singularity — custom NSIS installer logic
; Detects an existing installation and prompts the user to choose:
;   Fresh   → Fresh install  (old version removed silently first)
;   Upgrade → Upgrade in place  (files overwritten, data kept)
;   Cancel  → Abort the installer
;
; Uses only built-in NSIS MessageBox — no extra plugins needed.
; All code guarded with !ifndef BUILD_UNINSTALLER to prevent NSIS
; warning-as-error failures during the uninstaller build pass.

!include "LogicLib.nsh"

; ── customHeader / customInstallMode — empty stubs ───────────────────────────
; electron-builder calls these macros; provide empty implementations so the
; template compiles cleanly without any Var declarations or plugin calls.
!macro customHeader
!macroend

!macro customInstallMode
!macroend

; ── customInit — runs in .onInit, before any installer UI ────────────────────
!macro customInit
  !ifndef BUILD_UNINSTALLER

    ; ── Detect existing installation ─────────────────────────────────────────
    ; Try HKCU first (per-user install), fall back to HKLM (per-machine)
    ReadRegStr $R0 HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
      "UninstallString"
    ${If} $R0 == ""
      ReadRegStr $R0 HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
        "UninstallString"
    ${EndIf}

    ; Nothing found — first-time install, skip dialog
    ${If} $R0 == ""
      Return
    ${EndIf}

    ; Read the installed version number for the prompt
    ReadRegStr $R1 HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
      "DisplayVersion"
    ${If} $R1 == ""
      ReadRegStr $R1 HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
        "DisplayVersion"
    ${EndIf}

    ; ── Ask user: Fresh Install / Upgrade / Cancel ────────────────────────────
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 \
      "Singularity $R1 is already installed.$\n$\n\
Choose Yes  $\t Fresh Install $\t Removes old version first (recommended)$\n\
Choose No   $\t Upgrade       $\t Keeps your playlists and settings$\n\
Cancel      $\t               $\t Exits the installer" \
      IDNO sg_upgrade IDCANCEL sg_cancel

    ; ── YES / Fresh Install: uninstall old version silently first ─────────────
    ; Strip surrounding quotes from UninstallString, if present
    StrCpy $R2 $R0 1
    ${If} $R2 == '"'
      StrCpy $R0 $R0 "" 1
      StrCpy $R2 $R0 1 -1
      ${If} $R2 == '"'
        StrCpy $R0 $R0 -1
      ${EndIf}
    ${EndIf}
    ExecWait '"$R0" /S'
    Sleep 1500
    Return

    ; ── NO / Upgrade: upgrade in place — do nothing, let installer overwrite ──
    sg_upgrade:
    Return

    ; ── CANCEL: abort installer ───────────────────────────────────────────────
    sg_cancel:
    Quit

  !endif ; BUILD_UNINSTALLER
!macroend
