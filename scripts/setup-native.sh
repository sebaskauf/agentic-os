#!/bin/bash
# ============================================================
# Kopiert die node-pty Prebuilds aus node_modules in den
# ausgelieferten native/<plat>-<arch>/ Ordner (Distributions-Pfad).
# node-pty 1.1.0 = N-API -> ABI-stabil, kein electron-rebuild noetig.
#
# Layout das node-pty's lib/utils.js erwartet (require '../prebuilds/<plat>-<arch>/'):
#   native/<plat>-<arch>/lib/                      (JS-Loader)
#   native/<plat>-<arch>/prebuilds/<plat>-<arch>/  (pty.node/conpty.node + Helfer)
#   native/<plat>-<arch>/package.json
#
# macOS (darwin-arm64/x64) + Windows (win32-x64/arm64) in EINEM Paket.
# Windows bekommt zusaetzlich den ConPTY-Worker-Patch (scripts/win32-patch/),
# weil Obsidians Electron-Renderer keine worker_threads.Worker konstruieren darf.
# Dieser Schritt laeuft plattform-agnostisch (reines Kopieren, kein Compiler) und
# funktioniert daher auch auf dem Mac.
# ============================================================
set -e
PLUGDIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PLUGDIR/node_modules/node-pty"
NATIVE="$PLUGDIR/native"
WIN_PATCH="$PLUGDIR/scripts/win32-patch/windowsConoutConnection.js"

if [ ! -d "$SRC" ]; then
  echo "FEHLER: node_modules/node-pty fehlt. Erst 'npm install'."
  exit 1
fi

PLATFORMS="darwin-arm64 darwin-x64 win32-x64 win32-arm64"

for PA in $PLATFORMS; do
  echo "-> $PA"
  DEST="$NATIVE/$PA"
  if [ ! -d "$SRC/prebuilds/$PA" ]; then
    echo "   WARN: prebuilds/$PA fehlt in node_modules/node-pty, uebersprungen"
    continue
  fi
  rm -rf "$DEST"
  mkdir -p "$DEST"
  # lib/ (JS-Loader, identisch ueber Arches)
  cp -R "$SRC/lib" "$DEST/lib"
  # nur das Prebuild dieser Plattform (nicht alle ~250MB)
  mkdir -p "$DEST/prebuilds"
  cp -R "$SRC/prebuilds/$PA" "$DEST/prebuilds/$PA"
  cp "$SRC/package.json" "$DEST/package.json"
  case "$PA" in
    darwin-*)
      # macOS-Sicherheitsnetz: spawn-helper + pty.node ausfuehrbar (zip/git verliert x-Bit)
      chmod 755 "$DEST/prebuilds/$PA/spawn-helper" 2>/dev/null || true
      chmod 755 "$DEST/prebuilds/$PA/pty.node" 2>/dev/null || true
      ;;
    win32-*)
      # Windows-Patch: Worker-freie ConoutConnection ueber den Originalcode legen.
      if [ ! -f "$WIN_PATCH" ]; then
        echo "FEHLER: Windows-Patch fehlt: $WIN_PATCH"
        exit 1
      fi
      cp "$WIN_PATCH" "$DEST/lib/windowsConoutConnection.js"
      # die zugehoerige .map entfernen (zeigt sonst auf nicht mehr passenden Code)
      rm -f "$DEST/lib/windowsConoutConnection.js.map"
      # Worker-Skript wird durch den Patch nicht mehr gebraucht
      rm -f "$DEST/lib/worker/conoutSocketWorker.js" "$DEST/lib/worker/conoutSocketWorker.js.map" 2>/dev/null || true
      echo "   [patch] windowsConoutConnection.js (Worker -> inline socket piping)"
      ;;
  esac
  # Windows-Debug-Symbole (.pdb, ~27MB) raus falls vorhanden
  find "$DEST" -name "*.pdb" -delete 2>/dev/null || true
  echo "   $(du -sh "$DEST" | awk '{print $1}')"
done

echo "FERTIG. native/ Plattformen: $PLATFORMS"
