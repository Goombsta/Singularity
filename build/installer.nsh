; Singularity — custom NSIS installer logic
; Shows a standalone upgrade-choice dialog when an existing installation is
; detected.  Hooks into customInstallMode (fires before the Install Mode page)
; using a standalone nsDialogs window — no Page custom needed.
;
; All installer-only code is wrapped in !ifndef BUILD_UNINSTALLER so the
; uninstaller build pass never sees unused Var declarations (NSIS -WX).

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ─────────────────────────────────────────────────────────────────────────────
;  customHeader — global Vars + button-click handler Functions.
;  Skipped during the uninstaller build pass.
; ─────────────────────────────────────────────────────────────────────────────
!macro customHeader
  !ifndef BUILD_UNINSTALLER

    Var SG_ExistingVersion  ; "1.3.0" when upgrading, empty on first install
    Var SG_UninstallStr     ; full uninstall path from registry
    Var SG_hDlg             ; handle of our standalone upgrade dialog
    Var SG_hFreshRadio      ; handle of the "Fresh install" radio button
    Var SG_DoInstall        ; "1" = Install clicked, "0" = Cancel clicked

    ; Called when user clicks Install ────────────────────────────────────────
    Function SG_OnInstall
      Pop $0                         ; button HWND pushed by nsDialogs::OnClick
      StrCpy $SG_DoInstall "1"
      nsDialogs::EndDialog $SG_hDlg 1
    FunctionEnd

    ; Called when user clicks Cancel ─────────────────────────────────────────
    Function SG_OnCancel
      Pop $0
      StrCpy $SG_DoInstall "0"
      nsDialogs::EndDialog $SG_hDlg 0
    FunctionEnd

  !endif ; BUILD_UNINSTALLER
!macroend


; ─────────────────────────────────────────────────────────────────────────────
;  customInstallMode — fires inside the Install Mode page's pre-function.
;  Shows a standalone upgrade-choice dialog before any installer page appears.
; ─────────────────────────────────────────────────────────────────────────────
!macro customInstallMode

  ; Skip entirely when no prior installation found
  StrCmp $SG_ExistingVersion "" sg_im_skip

  StrCpy $SG_DoInstall ""

  ; ── Create standalone dialog ───────────────────────────────────────────────
  nsDialogs::Create 1044
  Pop $SG_hDlg
  StrCmp $SG_hDlg "error" sg_im_skip

  ; "X is already installed"
  ${NSD_CreateLabel} 7 7 296 13 \
    "Singularity $SG_ExistingVersion is already installed."
  Pop $0

  ; "Choose how…"
  ${NSD_CreateLabel} 7 26 296 13 \
    "Choose how you want to install the new version:"
  Pop $0

  ; ── Radio 1: Fresh install (pre-checked) ──────────────────────────────────
  ${NSD_CreateRadioButton} 7 47 296 13 \
    "Fresh install  —  Remove old version, install fresh  (recommended)"
  Pop $SG_hFreshRadio
  ${NSD_Check} $SG_hFreshRadio

  ${NSD_CreateLabel} 22 63 281 11 \
    "Previous playlists and settings will be removed."
  Pop $0

  ; ── Radio 2: Upgrade in place ──────────────────────────────────────────────
  ${NSD_CreateRadioButton} 7 81 296 13 \
    "Upgrade in place  —  Keep your playlists and settings"
  Pop $0

  ${NSD_CreateLabel} 22 97 281 11 \
    "App files are replaced; your data is preserved."
  Pop $0

  ; ── Install button ─────────────────────────────────────────────────────────
  ${NSD_CreateButton} 148 118 75 15 "Install"
  Pop $0
  GetFunctionAddress $1 SG_OnInstall
  nsDialogs::OnClick $0 $1

  ; ── Cancel button ──────────────────────────────────────────────────────────
  ${NSD_CreateButton} 233 118 75 15 "Cancel"
  Pop $0
  GetFunctionAddress $1 SG_OnCancel
  nsDialogs::OnClick $0 $1

  ; ── Show dialog (blocks until Install or Cancel clicked) ───────────────────
  nsDialogs::Show
  Pop $0  ; return value from EndDialog (1 = Install, 0 = Cancel)

  ; ── Process result ─────────────────────────────────────────────────────────
  StrCmp $SG_DoInstall "1" sg_im_install

  ; Cancel clicked (or dialog closed) — abort installation
  Quit

  sg_im_install:
  ${NSD_GetState} $SG_hFreshRadio $0
  ${If} $0 == ${BST_CHECKED}

    ; Strip surrounding quotes from UninstallString, if any
    StrCpy $1 $SG_UninstallStr 1
    ${If} $1 == '"'
      StrCpy $SG_UninstallStr $SG_UninstallStr "" 1
      StrCpy $1 $SG_UninstallStr 1 -1
      ${If} $1 == '"'
        StrCpy $SG_UninstallStr $SG_UninstallStr -1
      ${EndIf}
    ${EndIf}

    ; Silently uninstall the old version and wait
    ExecWait '"$SG_UninstallStr" /S'
    Sleep 1500

  ${EndIf}

  sg_im_skip:
!macroend


; ─────────────────────────────────────────────────────────────────────────────
;  customInit — runs inside .onInit before any UI.
;  Reads registry to detect an existing installation.
;  Skipped during the uninstaller build pass.
; ─────────────────────────────────────────────────────────────────────────────
!macro customInit
  !ifndef BUILD_UNINSTALLER

    ; Try HKCU first (per-user install), then HKLM (per-machine)
    ReadRegStr $SG_UninstallStr HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
      "UninstallString"
    ${If} $SG_UninstallStr == ""
      ReadRegStr $SG_UninstallStr HKLM \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
        "UninstallString"
    ${EndIf}

    ${If} $SG_UninstallStr != ""
      ReadRegStr $SG_ExistingVersion HKCU \
        "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
        "DisplayVersion"
      ${If} $SG_ExistingVersion == ""
        ReadRegStr $SG_ExistingVersion HKLM \
          "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
          "DisplayVersion"
      ${EndIf}
    ${EndIf}

  !endif ; BUILD_UNINSTALLER
!macroend
