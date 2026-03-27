; Singularity — custom NSIS installer logic
; Performs a fresh install:
;   1. Silently uninstalls any existing version
;   2. Clears registry keys so electron-builder does not double-uninstall
; Note: does NOT kill the running app — user closes it manually before installing.
; All code guarded with !ifndef BUILD_UNINSTALLER to prevent NSIS
; warning-as-error failures during the uninstaller build pass.

!include "LogicLib.nsh"

; ── customHeader / customInstallMode — empty stubs ───────────────────────────
!macro customHeader
!macroend

!macro customInstallMode
!macroend

; ── customInit — runs in .onInit, before any installer UI ────────────────────
!macro customInit
  !ifndef BUILD_UNINSTALLER

    ; ── Detect existing installation ─────────────────────────────────────────
    ReadRegStr $R0 HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
      "UninstallString"
    ${If} $R0 == ""
      ReadRegStr $R0 HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
        "UninstallString"
    ${EndIf}

    ; No existing install — proceed directly
    ${If} $R0 == ""
      Return
    ${EndIf}

    ; ── Strip surrounding quotes from UninstallString ─────────────────────────
    StrCpy $R2 $R0 1
    ${If} $R2 == '"'
      StrCpy $R0 $R0 "" 1
      StrCpy $R2 $R0 1 -1
      ${If} $R2 == '"'
        StrCpy $R0 $R0 -1
      ${EndIf}
    ${EndIf}

    ; ── Silently uninstall old version ────────────────────────────────────────
    ExecWait '"$R0" /S'
    Sleep 1500

    ; ── Remove registry keys so electron-builder does not double-uninstall ────
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4"
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4"

  !endif ; BUILD_UNINSTALLER
!macroend
