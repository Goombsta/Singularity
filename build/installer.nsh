; Singularity — custom NSIS installer logic
; Shows a custom nsDialogs page when an existing installation is detected.
; Radio buttons: Fresh install (default) | Upgrade in place
; Buttons: Install  Cancel  (Next button renamed to "Install")
; First-time installs skip this page entirely.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "winmessages.nsh"

; ─────────────────────────────────────────────────────────────────────────────
;  customHeader — injected at the very top of the main NSIS script.
;  Declares global Vars, the custom Page, and its two handler Functions.
; ─────────────────────────────────────────────────────────────────────────────
!macro customHeader

  Var SG_ExistingVersion  ; e.g. "1.3.0"  (empty = fresh install)
  Var SG_UninstallStr     ; full uninstall command from registry
  Var SG_hFreshRadio      ; handle — "Fresh install" radio button
  Var SG_hUpgradeRadio    ; handle — "Upgrade in place" radio button

  ; Insert our page first in the installer flow.
  ; Skipped automatically (via Abort) when no existing version is found.
  Page custom SingularityUpgradePage SingularityUpgradePageLeave

  ; ── Page display function ────────────────────────────────────────────────
  Function SingularityUpgradePage

    ; Skip entirely for fresh installs
    StrCmp $SG_ExistingVersion "" sg_abort_page

    !insertmacro MUI_HEADER_TEXT \
      "Installation Type" \
      "Singularity $SG_ExistingVersion is already installed."

    nsDialogs::Create 1018
    Pop $0
    StrCmp $0 "error" sg_abort_page

    ; ── "How would you like…" label ─────────────────────────────────────
    ${NSD_CreateLabel} 0 0 100% 16u \
      "Choose how you want to install the new version:"
    Pop $0

    ; ── Option 1: Fresh install ──────────────────────────────────────────
    ${NSD_CreateRadioButton} 0 22u 100% 14u \
      "Fresh install  —  Remove old version, install fresh"
    Pop $SG_hFreshRadio
    ${NSD_Check} $SG_hFreshRadio     ; selected by default

    ${NSD_CreateLabel} 16u 37u 85% 10u \
      "Recommended. Previous playlists and settings will be removed."
    Pop $0

    ; ── Option 2: Upgrade in place ───────────────────────────────────────
    ${NSD_CreateRadioButton} 0 52u 100% 14u \
      "Upgrade in place  —  Keep your playlists and settings"
    Pop $SG_hUpgradeRadio

    ${NSD_CreateLabel} 16u 67u 85% 10u \
      "App files are replaced; your data is preserved."
    Pop $0

    ; ── Rename "Next" button → "Install" ─────────────────────────────────
    GetDlgItem $0 $HWNDPARENT 1          ; button ID 1 = Next/Install
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Install"

    nsDialogs::Show
    Return

    sg_abort_page:
    Abort
  FunctionEnd

  ; ── Page leave function (Install was clicked) ────────────────────────────
  Function SingularityUpgradePageLeave

    ; Nothing to do on a first-time install
    StrCmp $SG_ExistingVersion "" sg_leave_done

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

      ; Run the old uninstaller silently, then wait for it to finish
      ExecWait '"$SG_UninstallStr" /S'
      Sleep 1500

    ${EndIf}

    sg_leave_done:
  FunctionEnd

!macroend


; ─────────────────────────────────────────────────────────────────────────────
;  customInit — runs inside .onInit (before any UI).
;  Reads registry to find an existing installation and stores results in Vars.
; ─────────────────────────────────────────────────────────────────────────────
!macro customInit

  ; Try HKCU first (per-user install), fall back to HKLM (per-machine)
  ReadRegStr $SG_UninstallStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
    "UninstallString"
  ${If} $SG_UninstallStr == ""
    ReadRegStr $SG_UninstallStr HKLM \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\d1ffad25-24c4-54a9-988a-aba120a273b4" \
      "UninstallString"
  ${EndIf}

  ; Only read the version string if an uninstall entry was found
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

!macroend
