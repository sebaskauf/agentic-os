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
 * Dieser Patch ersetzt den Worker durch direktes Inline-Socket-Piping im
 * Renderer-Thread: der _outSocket verbindet sich direkt mit der echten
 * conout-Pipe statt mit der Worker-Relay-Pipe (getWorkerPipeName).
 *
 * Der ClosePseudoConsole-Deadlock (microsoft/node-pty#375), gegen den der
 * Worker urspruenglich existierte, wird durch den FLUSH_DATA_INTERVAL-Drain
 * vor dem Schliessen nachgebildet: der Timer wird bei jedem neuen Datenevent
 * zurueckgesetzt, der Socket erst geschlossen wenn der Output wirklich steht.
 * Kein Byte-Verlust, kein Deadlock beim Schliessen waehrend aktivem Output.
 *
 * Bewaehrter Ansatz (gleicher Stack: lean-obsidian-terminal). Wird von
 * scripts/setup-native.sh nach dem lib-Copy ueber die win32-Ziele kopiert.
 * WICHTIG: node-pty-Version ist in package.json gepinnt. Bei Update diese
 * Datei gegen den neuen Originalcode (lib/windowsConoutConnection.js) pruefen.
 * ============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConoutConnection = void 0;
var eventEmitter2_1 = require("./eventEmitter2");
/**
 * Zeit (ms) ohne neue conout-Daten, nach der der Socket geschlossen wird.
 * Reset bei neuen Daten -> kein Byte-Verlust, kein Conpty-Deadlock.
 */
var FLUSH_DATA_INTERVAL = 1000;
var ConoutConnection = /** @class */ (function () {
    function ConoutConnection(_conoutPipeName, _useConptyDll) {
        var _this = this;
        this._conoutPipeName = _conoutPipeName;
        this._useConptyDll = _useConptyDll;
        this._isDisposed = false;
        this._socket = null;
        this._drainTimeout = undefined;
        this._onReady = new eventEmitter2_1.EventEmitter2();
        // PATCH: kein new Worker(). onReady muss ASYNCHRON feuern, weil der
        // onReady-Listener (windowsPtyAgent) erst NACH diesem Constructor
        // registriert wird. setTimeout(.,0) stellt sicher, dass er schon da ist.
        setTimeout(function () {
            if (!_this._isDisposed) {
                _this._onReady.fire();
            }
        }, 0);
    }
    Object.defineProperty(ConoutConnection.prototype, "onReady", {
        get: function () { return this._onReady.event; },
        enumerable: false,
        configurable: true
    });
    ConoutConnection.prototype.connectSocket = function (socket) {
        var _this = this;
        // PATCH: direkt an die echte conout-Pipe (kein Worker-Relay ueber
        // getWorkerPipeName). node-pty liest danach unveraendert ueber diesen Socket.
        this._socket = socket;
        // Sobald disposed: Drain-Timer bei jedem neuen Datenevent zuruecksetzen,
        // damit der letzte Output noch ankommt, bevor der Socket schliesst.
        socket.on("data", function () {
            if (_this._isDisposed && _this._drainTimeout) {
                clearTimeout(_this._drainTimeout);
                _this._drainTimeout = setTimeout(function () { return _this._destroySocket(); }, FLUSH_DATA_INTERVAL);
            }
        });
        socket.connect(this._conoutPipeName);
    };
    ConoutConnection.prototype.dispose = function () {
        if (!this._useConptyDll && this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        // Restliche Daten aus dem Socket lassen, dann schliessen.
        this._drainDataAndClose();
    };
    ConoutConnection.prototype._drainDataAndClose = function () {
        var _this = this;
        if (this._drainTimeout) {
            clearTimeout(this._drainTimeout);
        }
        this._drainTimeout = setTimeout(function () { return _this._destroySocket(); }, FLUSH_DATA_INTERVAL);
    };
    ConoutConnection.prototype._destroySocket = function () {
        // PATCH: kein worker.terminate() -- den direkten conout-Socket schliessen.
        if (this._socket) {
            try {
                if (!this._socket.destroyed) {
                    this._socket.destroy();
                }
            }
            catch (e) { /* ignore */ }
            this._socket = null;
        }
    };
    return ConoutConnection;
}());
exports.ConoutConnection = ConoutConnection;
//# sourceMappingURL=windowsConoutConnection.js.map
