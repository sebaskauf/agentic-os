// Laeuft im Electron-RENDERER (nodeIntegration), wo node-ptys ConPTY-Worker
// verboten ist -- exakt das Szenario, das in Obsidian auf Windows crasht.
//
// Drei Tests:
//   A  gepatchtes node-pty (native/<plat>-<arch>/) MUSS spawnen + Output liefern + sauber exiten.
//      Auf Windows beweist das, dass der Worker-Patch greift (ungepatcht crasht hier schon).
//   B  (nur Windows) UNGEPATCHTES node-pty aus node_modules MUSS am Worker crashen.
//      Negativ-Beweis: ohne Patch geht es nachweislich nicht.
//   C  gepatchtes node-pty: viel Output erzeugen, mittendrin killen -> onExit MUSS schnell feuern.
//      Beweist: kein ClosePseudoConsole-Deadlock (microsoft/node-pty#375).
const { ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");

const isWin = process.platform === "win32";
const platArch = `${process.platform}-${process.arch}`;
const repoRoot = path.resolve(__dirname, "..", "..");
const patchedEntry = path.join(repoRoot, "native", platArch, "lib", "index.js");
const rawEntry = path.join(repoRoot, "node_modules", "node-pty");

const logEl = document.getElementById("log");
function log(m) {
  const line = String(m);
  ipcRenderer.send("smoke-log", line);
  if (logEl) logEl.textContent += line + "\n";
}

function shellShort() {
  return isWin
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", "echo SMOKE_OK_MARKER& echo done"] }
    : { file: "/bin/bash", args: ["-lc", "echo SMOKE_OK_MARKER; echo done"] };
}
function shellFlood() {
  return isWin
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", "for /L %i in (1,1,200000) do @echo FLOOD_%i"] }
    : { file: "/bin/bash", args: ["-lc", "i=0; while [ $i -lt 200000 ]; do echo FLOOD_$i; i=$((i+1)); done"] };
}

// Test A: spawnen, Output sammeln, auf sauberes Exit warten.
function testSpawnAndDrain(pty, label) {
  return new Promise((resolve, reject) => {
    const { file, args } = shellShort();
    let out = "";
    let settled = false;
    let p;
    try {
      p = pty.spawn(file, args, { name: "xterm-color", cols: 80, rows: 30, cwd: repoRoot, env: process.env });
    } catch (e) {
      reject(e);
      return;
    }
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { p.kill(); } catch (_) {}
      reject(new Error(`${label}: kein Exit in 15s (moeglicher Deadlock)`));
    }, 15000);
    p.onData((d) => { out += d; });
    p.onExit(({ exitCode }) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      if (out.includes("SMOKE_OK_MARKER")) resolve({ exitCode, bytes: out.length });
      else reject(new Error(`${label}: Marker fehlt im Output (${out.length} bytes)`));
    });
  });
}

// Test C: viel Output, frueh killen, messen ob Exit schnell kommt (kein Close-Deadlock).
function testKillDuringOutput(pty, label) {
  return new Promise((resolve, reject) => {
    const { file, args } = shellFlood();
    let bytes = 0;
    let killedAt = 0;
    let settled = false;
    let p;
    try {
      p = pty.spawn(file, args, { name: "xterm-color", cols: 80, rows: 30, cwd: repoRoot, env: process.env });
    } catch (e) {
      reject(e);
      return;
    }
    const deadlockTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { p.kill(); } catch (_) {}
      reject(new Error(`${label}: Exit kam nicht innerhalb 8s nach kill -> Close-Deadlock`));
    }, 8000);
    p.onData((d) => {
      bytes += d.length;
      // sobald Output stroemt, mitten rein killen
      if (killedAt === 0 && bytes > 2000) {
        killedAt = Date.now();
        try { p.kill(); } catch (_) {}
      }
    });
    p.onExit(({ exitCode }) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlockTimer);
      const ms = killedAt ? Date.now() - killedAt : 0;
      resolve({ exitCode, bytesBeforeKill: bytes, exitAfterKillMs: ms });
    });
  });
}

async function run() {
  const report = { platArch, electron: process.versions.electron, modules: process.versions.modules, tests: {} };
  log(`platform=${platArch} electron=${process.versions.electron} NMV=${process.versions.modules}`);

  // A: gepatcht muss laufen
  try {
    log(`A: lade gepatchtes node-pty: ${patchedEntry}`);
    if (!fs.existsSync(patchedEntry)) throw new Error(`fehlt: ${patchedEntry}`);
    const ptyA = require(patchedEntry);
    const rA = await testSpawnAndDrain(ptyA, "A");
    report.tests.patchedSpawns = { ok: true, ...rA };
    log(`A PASS: spawn + drain + clean exit (${rA.bytes} bytes)`);

    // C: gleicher (gepatchter) pty, kill-waehrend-Output
    log("C: kill-waehrend-Output (Deadlock-Check)");
    const rC = await testKillDuringOutput(ptyA, "C");
    report.tests.noCloseDeadlock = { ok: true, ...rC };
    log(`C PASS: Exit ${rC.exitAfterKillMs}ms nach kill (${rC.bytesBeforeKill} bytes vorher)`);
  } catch (e) {
    const msg = String((e && e.message) || e);
    report.tests.patchedSpawns = report.tests.patchedSpawns || { ok: false, error: msg };
    if (!report.tests.noCloseDeadlock) report.tests.noCloseDeadlock = { ok: false, error: msg };
    log(`A/C FAIL: ${msg}`);
  }

  // B: ungepatcht muss (auf Windows) am Worker crashen
  if (isWin) {
    try {
      log("B: lade UNGEPATCHTES node-pty (node_modules), erwarte Worker-Crash");
      const ptyB = require(rawEntry);
      await testSpawnAndDrain(ptyB, "B");
      report.tests.unpatchedCrashes = { ok: false, note: "ungepatcht crashte NICHT (unerwartet)" };
      log("B UNERWARTET: ungepatcht lief durch");
    } catch (e) {
      const msg = String((e && e.message) || e);
      const isWorker = /Worker|worker_threads|creating Workers/i.test(msg);
      report.tests.unpatchedCrashes = { ok: isWorker, matchedWorkerError: isWorker, error: msg };
      log(`B ${isWorker ? "PASS (crasht wie erwartet)" : "INCONCLUSIVE"}: ${msg}`);
    }
  } else {
    report.tests.unpatchedCrashes = { ok: true, skipped: "non-windows: kein ConPTY-Worker-Pfad" };
    log("B SKIP: non-windows");
  }

  const a = report.tests.patchedSpawns && report.tests.patchedSpawns.ok;
  const c = report.tests.noCloseDeadlock && report.tests.noCloseDeadlock.ok;
  const b = report.tests.unpatchedCrashes && report.tests.unpatchedCrashes.ok;
  report.ok = Boolean(a && c && b);
  report.summary = `patched-spawns=${!!a} no-deadlock=${!!c} unpatched-crashes=${!!b} (${platArch})`;
  log("SUMMARY: " + report.summary);
  ipcRenderer.send("smoke-result", report);
}

run().catch((e) => {
  ipcRenderer.send("smoke-result", { ok: false, platArch, summary: "renderer threw: " + ((e && e.message) || e) });
});
