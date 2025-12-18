; Custom NSIS installer script for silent auto-updates
; This ensures smooth, non-interactive updates

!macro customInit
  ; Check if running from auto-updater (silent mode)
  ${IfNot} ${Silent}
    ; Normal installation - show UI
  ${Else}
    ; Silent auto-update installation
    SetSilent silent
    
    ; Skip user prompts
    SetAutoClose true
    
    ; Log silent installation
    DetailPrint "Auto-update: Silent installation mode"
  ${EndIf}
!macroend

!macro customInstall
  ; Additional custom installation steps if needed
  DetailPrint "Installing PDF-Merger update..."
!macroend

!macro customUnInit
  ; Silent uninstall during updates
  ${If} ${Silent}
    SetAutoClose true
    DetailPrint "Auto-update: Silent uninstallation mode"
  ${EndIf}
!macroend