; Custom NSIS installer script for PDF Merger
; This adds custom messages and actions during installation

!macro customInstall
  ; This runs during installation
  DetailPrint "Installing PDF Merger..."
  DetailPrint "All your files stay on your computer - no data is uploaded"
!macroend

!macro customUnInstall
  ; This runs during uninstallation
  DetailPrint "Uninstalling PDF Merger..."
  DetailPrint "Removing application files..."
!macroend

; Custom welcome message
!macro customHeader
  !system 'echo "PDF Merger - Professional Edition"'
!macroend