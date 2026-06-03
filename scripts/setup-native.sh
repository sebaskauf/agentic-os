#!/bin/bash
# ============================================================
# Kopiert die node-pty Prebuilds aus node_modules in den
# ausgelieferten native/<plat>-<arch>/ Ordner (Distributions-Pfad).
# node-pty 1.1.0 = N-API → ABI-stabil, kein electron-rebuild noetig.
#
# Layout das node-pty's lib/utils.js erwartet (require '../prebuilds/<plat>-<arch>/'):
#   native/<plat>-<arch>/lib/                      (JS-Loader)
#   native/<plat>-<arch>/prebuilds/<plat>-<arch>/  (pty.node + spawn-helper)
#   native/<plat>-<arch>/package.json
#
# Welle 1: nur macOS (darwin-arm64 + darwin-x64).
# Windows (win32-x64/arm64) erst in Welle 2 NACH dem ConPTY-Worker-Patch +
# echtem Hardware-Test — sonst Close-Deadlock im Renderer.
# ============================================================
set -e
PLUGDIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PLUGDIR/node_modules/node-pty"
NATIVE="$PLUGDIR/native"

if [ ! -d "$SRC" ]; then
  echo "FEHLER: node_modules/node-pty fehlt. Erst 'npm install'."
  exit 1
fi

# Welle 1: macOS-Arches. Fuer Windows spaeter "win32-x64 win32-arm64" ergaenzen (+ Patch).
PLATFORMS="darwin-arm64 darwin-x64"

for PA in $PLATFORMS; do
  echo "→ $PA"
  DEST="$NATIVE/$PA"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  # lib/ (JS-Loader, identisch ueber Arches)
  cp -R "$SRC/lib" "$DEST/lib"
  # nur das Prebuild dieser Plattform (nicht alle 62MB)
  mkdir -p "$DEST/prebuilds"
  cp -R "$SRC/prebuilds/$PA" "$DEST/prebuilds/$PA"
  cp "$SRC/package.json" "$DEST/package.json"
  # macOS-Sicherheitsnetz: spawn-helper + pty.node ausfuehrbar (zip/git verliert x-Bit)
  case "$PA" in
    darwin-*)
      chmod 755 "$DEST/prebuilds/$PA/spawn-helper" 2>/dev/null || true
      chmod 755 "$DEST/prebuilds/$PA/pty.node" 2>/dev/null || true
      ;;
  esac
  # Windows-Debug-Symbole (.pdb ~11MB) raus falls vorhanden
  find "$DEST" -name "*.pdb" -delete 2>/dev/null || true
  echo "   $(du -sh "$DEST" | awk '{print $1}')"
done

echo "FERTIG. native/ Plattformen: $PLATFORMS"
