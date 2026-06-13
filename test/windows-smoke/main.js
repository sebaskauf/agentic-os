// Electron-Main fuer den node-pty Renderer-Smoke-Test.
//
// WARUM EIN BrowserWindow: node-ptys ConPTY-Layer crasht NUR im Electron-RENDERER
// (dort verbietet Electron worker_threads.Worker -- exakt wie in Obsidian). Im
// Main-Process waere der Worker erlaubt und der Test wertlos. Der eigentliche Test
// laeuft daher in renderer.js. Hier nur: Fenster (unsichtbar) starten, Ergebnis
// einsammeln, Exit-Code setzen, und per Hard-Timeout einen echten Deadlock fangen.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const HARD_TIMEOUT_MS = 90000; // haengt der Renderer (ConPTY-Deadlock), failen wir hart

let finished = false;
function done(code, reason) {
  if (finished) return;
  finished = true;
  console.log(`\n[smoke] RESULT: ${code === 0 ? "PASS" : "FAIL"} -- ${reason}`);
  app.exit(code);
}

app.commandLine.appendSwitch("disable-gpu");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  ipcMain.on("smoke-log", (_e, msg) => console.log("[renderer] " + msg));
  ipcMain.on("smoke-result", (_e, payload) => {
    console.log("\n[smoke] Report:\n" + JSON.stringify(payload, null, 2));
    done(payload && payload.ok ? 0 : 1, (payload && payload.summary) || "see report");
  });

  win.webContents.on("render-process-gone", (_e, details) => {
    done(1, "renderer crashed: " + JSON.stringify(details));
  });

  win.loadFile(path.join(__dirname, "index.html"));

  setTimeout(
    () => done(1, `hard timeout ${HARD_TIMEOUT_MS}ms -- renderer hung (possible ConPTY close-deadlock)`),
    HARD_TIMEOUT_MS
  );
});

app.on("window-all-closed", () => {
  /* bewusst leer: wir warten auf explizites done() statt auf Fenster-Close */
});
