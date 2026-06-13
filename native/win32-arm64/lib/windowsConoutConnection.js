"use strict";
/**
 * Copyright (c) 2020, Microsoft Corporation (MIT License).
 *
 * ============================================================================
 * AGENTIC-OS WINDOWS-PATCH  (NICHT der node-pty-Originalcode)
 * ----------------------------------------------------------------------------
 * node-pty drained die ConPTY conout-Pipe normalerweise in einem
 * worker_threads.Worker (lib/worker/conoutSocketWorker.js). Obsidians
 * Electron-RENDERER verbietet das Konstruieren von Workern:
 *   "Failed to construct 'Worker': The V8 platform used by this instance of
 *    Isolate does not support creating Workers."
 * Damit crasht das Terminal beim ersten Spawn auf Windows.
 *
 * Dieser Patch repliziert EXAKT, was der Worker tat -- nur inline im
 * Renderer-Thread statt im Worker-Thread:
 *   1. conout-Pipe (ConPTY-Output) sofort lesen/drainen,
 *   2. einen Relay-Server auf der "-worker"-Pipe oeffnen,
 *   3. die conout-Daten dorthin durchpipen.
 * node-ptys _outSocket verbindet sich unveraendert mit der "-worker"-Pipe
 * (connectSocket). Die Drain-Schicht MUSS erhalten bleiben, sonst blockiert
 * ConPTY synchron, weil die Output-Pipe nie geleert wird (Deadlock/Hang).
 * Der ClosePseudoConsole-Deadlock (microsoft/node-pty#375) wird durch den
 * 1s-Drain vor dem Schliessen abgefedert.
 *
 * Bewaehrter Mechanismus aus dem Produktiv-Plugin lean-obsidian-terminal
 * (sdkasper, patches/windowsConoutConnection.js), gleicher Stack.
 * Wird von scripts/setup-native.sh ueber die win32-Ziele kopiert.
 * WICHTIG: node-pty-Version ist gepinnt. Bei Update gegen den neuen
 * Originalcode (lib/windowsConoutConnection.js) pruefen.
 * ============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConoutConnection = void 0;
var net = require("net");
var conout_1 = require("./shared/conout");

var ConoutConnection = (function () {
    function ConoutConnection(_conoutPipeName, _useConptyDll) {
        var _this = this;
        this._conoutPipeName = _conoutPipeName;
        this._useConptyDll = _useConptyDll;
        this._isDisposed = false;
        this._readyCallbacks = [];
        this._isReady = false;
        this._conoutSocket = null;
        this._server = null;
        this._drainTimeout = null;

        // Inline-Variante dessen, was der Worker tat: conout-Pipe verbinden,
        // Relay-Server oeffnen, Daten durchpipen.
        this._conoutSocket = new net.Socket();
        this._conoutSocket.setEncoding("utf8");
        this._conoutSocket.connect(_conoutPipeName, function () {
            _this._server = net.createServer(function (workerSocket) {
                _this._conoutSocket.pipe(workerSocket);
            });
            _this._server.listen(conout_1.getWorkerPipeName(_conoutPipeName));
            _this._isReady = true;
            _this._readyCallbacks.forEach(function (cb) { cb(); });
            _this._readyCallbacks = [];
        });

        this._conoutSocket.on("error", function () {
            // Verbindungsfehler waehrend Cleanup ignorieren
        });
    }

    ConoutConnection.prototype.onReady = function (listener) {
        if (this._isReady) {
            listener();
        } else {
            this._readyCallbacks.push(listener);
        }
        return { dispose: function () {} };
    };

    ConoutConnection.prototype.connectSocket = function (socket) {
        socket.connect(conout_1.getWorkerPipeName(this._conoutPipeName));
    };

    ConoutConnection.prototype.dispose = function () {
        var _this = this;
        if (!this._useConptyDll && this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        if (this._drainTimeout) {
            clearTimeout(this._drainTimeout);
        }
        // Restliche Daten noch durchlaufen lassen, dann Server + Socket schliessen.
        this._drainTimeout = setTimeout(function () {
            try {
                if (_this._server) _this._server.close();
                if (_this._conoutSocket) _this._conoutSocket.destroy();
            } catch (e) {
                // Cleanup-Fehler ignorieren
            }
        }, 1000);
    };

    return ConoutConnection;
}());

exports.ConoutConnection = ConoutConnection;
