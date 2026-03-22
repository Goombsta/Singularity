; Singularity — custom NSIS installer logic
; Detects an existing installation and prompts the user to choose:
;   Fresh   → Fresh install  (old version removed silently first)
;   Upgrade → Upgrade in place  (files overwritten, data kept)
;   Cancel  → Abort the installer
;
; The MessageBox Yes/No buttons are renamed to "Fresh"/"Upgrade" using a
; WH_CBT Windows hook (System::plugin) that fires on HCBT_ACTIVATE just
; before the dialog is shown, renames the buttons via SendMessageW, then
; immediately unhooks itself.
;
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

; ── Vars and CBT-hook callback — installer pass only ─────────────────────────
!ifndef BUILD_UNINSTALLER

Var SG_hCBTHook  ; hook handle returned by SetWindowsHookEx
Var SG_tmpCode   ; receives nCode from hook, reused as button HWND
Var SG_tmpHwnd   ; receives wParam (HWND being activated) from hook

; SG_RenameBtns — called by WH_CBT hook on every window activation event.
; Renames IDYES→"Fresh" and IDNO→"Upgrade" when the MessageBox appears,
; then unhooks so later dialogs are not affected.
Function SG_RenameBtns
  ; System plugin pushes params left→right; stack top = last param (lParam).
  Pop $SG_tmpCode   ; lParam  (unused for HCBT_ACTIVATE)
  Pop $SG_tmpHwnd   ; wParam  = HWND of the window being activated
  Pop $SG_tmpCode   ; nCode

  ${If} $SG_tmpCode == 5             ; HCBT_ACTIVATE = 5
    ; Check for IDYES (control ID 6) — confirms this is our MessageBox,
    ; not the installer's own window or some earlier activation event.
    GetDlgItem $SG_tmpCode $SG_tmpHwnd 6
    ${If} $SG_tmpCode <> 0
      System::Call 'user32::SendMessageW(i $SG_tmpCode, i 12, i 0, w "Fresh")'

      GetDlgItem $SG_tmpCode $SG_tmpHwnd 7   ; IDNO = 7
      ${If} $SG_tmpCode <> 0
        System::Call 'user32::SendMessageW(i $SG_tmpCode, i 12, i 0, w "Upgrade")'
      ${EndIf}

      ; Unhook immediately — only needs to fire once
      System::Call 'user32::UnhookWindowsHookEx(i $SG_hCBTHook)'
      StrCpy $SG_hCBTHook 0
    ${EndIf}
  ${EndIf}

  Push 0   ; return LRESULT 0 (pass event to next hook in chain)
FunctionEnd

!endif ; BUILD_UNINSTALLER

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

    ; ── Install WH_CBT hook to rename buttons before dialog is shown ──────────
    ; GetFunctionAddress creates an explicit NSIS reference to SG_RenameBtns,
    ; suppressing warning 6010 ("function not referenced") which electron-builder
    ; treats as an error. $R3 is immediately overwritten with the thread ID.
    StrCpy $SG_hCBTHook 0
    GetFunctionAddress $R3 SG_RenameBtns
    System::Call 'kernel32::GetCurrentThreadId() i.r3'
    System::Call 'user32::SetWindowsHookExW(i 5, k SG_RenameBtns, i 0, i r3) i.r3'
    StrCpy $SG_hCBTHook $r3

    ; ── Ask user: Fresh / Upgrade / Cancel ───────────────────────────────────
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 \
      "Singularity $R1 is already installed.$\n$\n\
Choose how to proceed:$\n$\n\
  Fresh   $\t Remove old version first$\t (recommended)$\n\
  Upgrade $\t Keep your playlists and settings$\n\
  Cancel  $\t Exit installer" \
      IDNO sg_upgrade IDCANCEL sg_cancel

    ; Safety: unhook if callback did not fire (e.g. MessageBox shown without activation)
    ${If} $SG_hCBTHook <> 0
      System::Call 'user32::UnhookWindowsHookEx(i $SG_hCBTHook)'
      StrCpy $SG_hCBTHook 0
    ${EndIf}

    ; ── FRESH (IDYES): uninstall old version silently first ───────────────────
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

    ; ── UPGRADE (IDNO): upgrade in place — do nothing, let installer overwrite ─
    sg_upgrade:
    ${If} $SG_hCBTHook <> 0
      System::Call 'user32::UnhookWindowsHookEx(i $SG_hCBTHook)'
      StrCpy $SG_hCBTHook 0
    ${EndIf}
    Return

    ; ── CANCEL: abort installer ───────────────────────────────────────────────
    sg_cancel:
    ${If} $SG_hCBTHook <> 0
      System::Call 'user32::UnhookWindowsHookEx(i $SG_hCBTHook)'
      StrCpy $SG_hCBTHook 0
    ${EndIf}
    Quit

  !endif ; BUILD_UNINSTALLER
!macroend
