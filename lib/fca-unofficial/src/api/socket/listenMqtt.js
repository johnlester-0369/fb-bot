"use strict";
const mqtt = require("mqtt");
const WebSocket = require("ws");
const HttpsProxyAgent = require("https-proxy-agent");
const EventEmitter = require("events");
const logger = require("../../../func/logger");
const { parseAndCheckLogin } = require("../../utils/client");
const { buildProxy, buildStream } = require("./detail/buildStream");
const { topics } = require("./detail/constants");
const createParseDelta = require("./core/parseDelta");
const createListenMqtt = require("./core/connectMqtt");
const createGetSeqID = require("./core/getSeqID");
const markDelivery = require("./core/markDelivery");
const getTaskResponseData = require("./core/getTaskResponseData");
const createEmitAuth = require("./core/emitAuth");
const createMiddlewareSystem = require("./middleware");

const MQTT_DEFAULTS = {
  cycleMs: 60 * 60 * 1000,
  reconnectDelayMs: 2000,
  autoReconnect: true,
  reconnectAfterStop: false
};

/**
 * Configure MQTT options with defaults
 * @param {Object} ctx - Context object
 * @param {Object} overrides - Option overrides
 * @returns {Object} Merged configuration
 */
function mqttConf(ctx, overrides) {
  ctx._mqttOpt = Object.assign({}, MQTT_DEFAULTS, ctx._mqttOpt || {}, overrides || {});
  if (typeof ctx._mqttOpt.autoReconnect === "boolean") {
    ctx.globalOptions.autoReconnect = ctx._mqttOpt.autoReconnect;
  }
  return ctx._mqttOpt;
}

/**
 * ListenMqtt factory - creates MQTT listener with EventEmitter pattern
 * @param {Object} defaultFuncs - Default functions (get, post, etc.)
 * @param {Object} api - API object
 * @param {Object} ctx - Context object
 * @param {Object} opts - Options
 * @returns {Function} listenMqtt function
 */
module.exports = function (defaultFuncs, api, ctx, opts) {
  // Initialize middleware system if not already initialized
  if (!ctx._middleware) {
    ctx._middleware = createMiddlewareSystem();
  }
  const middleware = ctx._middleware;

  // Create emitAuth first so it can be injected into factories
  const emitAuth = createEmitAuth({ logger });

  // Create parseDelta with dependencies
  const parseDelta = createParseDelta({ markDelivery, parseAndCheckLogin });

  // Create listenMqtt (connectMqtt) with all dependencies
  const connectMqtt = createListenMqtt({
    WebSocket,
    mqtt,
    HttpsProxyAgent,
    buildStream,
    buildProxy,
    topics,
    parseDelta,
    getTaskResponseData,
    logger,
    emitAuth
  });

  // Create getSeqID factory
  const getSeqIDFactory = createGetSeqID({
    parseAndCheckLogin,
    listenMqtt: connectMqtt,
    logger,
    emitAuth
  });

  let conf = mqttConf(ctx, opts);

  /**
   * Install post guard to catch auth errors
   * @param {EventEmitter} emitter - Event emitter for error events
   */
  function installPostGuard(emitter) {
    if (ctx._postGuarded) return defaultFuncs.post;
    const rawPost = defaultFuncs.post && defaultFuncs.post.bind(defaultFuncs);
    if (!rawPost) return defaultFuncs.post;

    function postSafe(...args) {
      return rawPost(...args).catch(err => {
        const msg = (err && err.error) || (err && err.message) || String(err || "");
        if (/Not logged in|blocked the login/i.test(msg)) {
          emitAuth(
            ctx,
            api,
            emitter,
            /blocked/i.test(msg) ? "login_blocked" : "not_logged_in",
            msg
          );
        }
        throw err;
      });
    }
    defaultFuncs.post = postSafe;
    ctx._postGuarded = true;
    return postSafe;
  }

  /**
   * Get sequence ID and start listening
   * @param {EventEmitter} emitter - Event emitter
   */
  function getSeqIDWrapper(emitter) {
    if (ctx._ending && !ctx._cycling) {
      logger.warn("mqtt getSeqID skipped - ending");
      return Promise.resolve();
    }
    const form = {
      av: ctx.globalOptions.pageID,
      queries: JSON.stringify({
        o0: {
          doc_id: "3336396659757871",
          query_params: {
            limit: 1,
            before: null,
            tags: ["INBOX"],
            includeDeliveryReceipts: false,
            includeSeqID: true
          }
        }
      })
    };
    logger.info("mqtt getSeqID call");
    return getSeqIDFactory(defaultFuncs, api, ctx, emitter, form)
      .then(() => {
        logger.info("mqtt getSeqID done");
        ctx._cycling = false;
      })
      .catch(e => {
        ctx._cycling = false;
        logger.error(`mqtt getSeqID error:`, e);
        if (ctx._ending) return;
        if (ctx.globalOptions.autoReconnect) {
          const d = conf.reconnectDelayMs;
          ctx._reconnectAttempts = (ctx._reconnectAttempts || 0) + 1;
          logger.warn(`mqtt getSeqID will retry in ${d}ms (attempt ${ctx._reconnectAttempts})`);
          emitter.emit("reconnecting", ctx._reconnectAttempts);
          setTimeout(() => {
            if (!ctx._ending) getSeqIDWrapper(emitter);
          }, d);
        }
      });
  }

  /**
   * Check if MQTT client is connected
   * @returns {boolean} Connection status
   */
  function isConnected() {
    return !!(ctx.mqttClient && ctx.mqttClient.connected);
  }

  /**
   * Unsubscribe from all topics
   * @param {Function} cb - Callback when complete
   */
  function unsubAll(cb) {
    if (!isConnected()) {
      if (cb) setTimeout(cb, 0);
      return;
    }
    let pending = topics.length;
    if (!pending) {
      if (cb) setTimeout(cb, 0);
      return;
    }
    let fired = false;
    const timeout = setTimeout(() => {
      if (!fired) {
        fired = true;
        logger.warn("unsubAll timeout, proceeding anyway");
        if (cb) cb();
      }
    }, 5000);

    topics.forEach(t => {
      try {
        ctx.mqttClient.unsubscribe(t, () => {
          if (--pending === 0 && !fired) {
            clearTimeout(timeout);
            fired = true;
            if (cb) cb();
          }
        });
      } catch (err) {
        logger.warn(`unsubAll error for topic ${t}:`, err);
        if (--pending === 0 && !fired) {
          clearTimeout(timeout);
          fired = true;
          if (cb) cb();
        }
      }
    });
  }

  /**
   * End MQTT connection quietly
   * @param {Function} next - Callback when complete
   */
  function endQuietly(next) {
    const finish = () => {
      try {
        if (ctx.mqttClient) {
          ctx.mqttClient.removeAllListeners();
        }
      } catch (_) { }
      ctx.mqttClient = undefined;
      ctx.lastSeqId = null;
      ctx.syncToken = undefined;
      ctx.t_mqttCalled = false;
      ctx._ending = false;
      ctx._cycling = false;
      ctx._reconnectAttempts = 0;
      if (ctx._reconnectTimer) {
        clearTimeout(ctx._reconnectTimer);
        ctx._reconnectTimer = null;
      }
      if (ctx._rTimeout) {
        clearTimeout(ctx._rTimeout);
        ctx._rTimeout = null;
      }
      if (ctx.tasks && ctx.tasks instanceof Map) {
        ctx.tasks.clear();
      }
      if (ctx._userInfoIntervals && Array.isArray(ctx._userInfoIntervals)) {
        ctx._userInfoIntervals.forEach(interval => {
          try { clearInterval(interval); } catch (_) { }
        });
        ctx._userInfoIntervals = [];
      }
      if (ctx._autoSaveInterval && Array.isArray(ctx._autoSaveInterval)) {
        ctx._autoSaveInterval.forEach(interval => {
          try { clearInterval(interval); } catch (_) { }
        });
        ctx._autoSaveInterval = [];
      }
      if (ctx._scheduler && typeof ctx._scheduler.destroy === "function") {
        try { ctx._scheduler.destroy(); } catch (_) { }
        ctx._scheduler = undefined;
      }
      if (global.mqttClient) {
        delete global.mqttClient;
      }
      next && next();
    };
    try {
      if (ctx.mqttClient) {
        if (isConnected()) {
          try {
            ctx.mqttClient.publish("/browser_close", "{}", { qos: 0 });
          } catch (_) { }
        }
        ctx.mqttClient.end(true, finish);
      } else finish();
    } catch (_) { finish(); }
  }

  /**
   * Delayed reconnect helper
   * @param {EventEmitter} emitter - Event emitter
   */
  function delayedReconnect(emitter) {
    const d = conf.reconnectDelayMs;
    ctx._reconnectAttempts = (ctx._reconnectAttempts || 0) + 1;
    logger.info(`mqtt reconnect in ${d}ms (attempt ${ctx._reconnectAttempts})`);
    emitter.emit("reconnecting", ctx._reconnectAttempts);
    setTimeout(() => getSeqIDWrapper(emitter), d);
  }

  /**
   * Force cycle the MQTT connection
   * @param {EventEmitter} emitter - Event emitter
   */
  function forceCycle(emitter) {
    if (ctx._cycling) {
      logger.warn("mqtt force cycle already in progress");
      return;
    }
    ctx._cycling = true;
    ctx._ending = true;
    logger.warn("mqtt force cycle begin");
    emitter.emit("disconnected", "cycle", true);
    unsubAll(() => endQuietly(() => delayedReconnect(emitter)));
  }

  /**
   * Main listenMqtt function - returns EventEmitter
   * @returns {EventEmitter} Message emitter with lifecycle events
   * 
   * @example
   * const listener = api.listenMqtt();
   * 
   * // Message events
   * listener.on("message", (msg) => console.log("New message:", msg.body));
   * listener.on("message_reply", (msg) => console.log("Reply:", msg.body));
   * listener.on("message_reaction", (data) => console.log("Reaction:", data.reaction));
   * listener.on("message_unsend", (data) => console.log("Unsent:", data.messageID));
   * listener.on("typing", (data) => console.log("Typing:", data.from));
   * listener.on("presence", (data) => console.log("Presence:", data.userID));
   * listener.on("read_receipt", (data) => console.log("Read:", data.reader));
   * listener.on("event", (data) => console.log("Event:", data.logMessageType));
   * 
   * // Lifecycle events
   * listener.on("connected", () => console.log("Connected!"));
   * listener.on("disconnected", (reason, willReconnect) => {
   *   console.log(`Disconnected: ${reason}, reconnecting: ${willReconnect}`);
   * });
   * listener.on("reconnecting", (attempt) => console.log(`Reconnecting attempt ${attempt}`));
   * listener.on("closed", () => console.log("Listener closed"));
   * 
   * // Error events
   * listener.on("error", (err) => console.error("Non-fatal error:", err));
   * listener.on("fatal", (err) => {
   *   console.error("Fatal error:", err);
   *   process.exit(1);
   * });
   * 
   * // Stop listening
   * listener.stopListening();
   * // or
   * await listener.stopListeningAsync();
   */
  return function listenMqtt() {
    /**
     * Message emitter class with lifecycle methods
     * @extends EventEmitter
     */
    class MessageEmitter extends EventEmitter {
      constructor() {
        super();
        this._stopped = false;
      }

      /**
       * Stop listening to MQTT messages
       * @param {Function} [callback] - Optional callback when stopped
       */
      stopListening(callback) {
        const cb = callback || function () { };
        if (this._stopped) {
          logger.warn("mqtt already stopped");
          setTimeout(cb, 0);
          return;
        }
        this._stopped = true;
        logger.info("mqtt stop requested");

        if (ctx._autoCycleTimer) {
          clearInterval(ctx._autoCycleTimer);
          ctx._autoCycleTimer = null;
          logger.info("mqtt auto-cycle cleared");
        }

        if (ctx._reconnectTimer) {
          clearTimeout(ctx._reconnectTimer);
          ctx._reconnectTimer = null;
        }

        ctx._ending = true;
        const self = this;
        unsubAll(() => endQuietly(() => {
          logger.info("mqtt stopped");
          self.emit("closed");
          cb();
          conf = mqttConf(ctx, conf);
          if (conf.reconnectAfterStop) delayedReconnect(self);
        }));
      }

      /**
       * Stop listening asynchronously
       * @returns {Promise<void>} Resolves when stopped
       */
      async stopListeningAsync() {
        return new Promise(resolve => { this.stopListening(resolve); });
      }
    }

    const emitter = new MessageEmitter();
    ctx._reconnectAttempts = 0;

    // Store emitter reference for middleware re-wrapping
    ctx._emitter = emitter;

    conf = mqttConf(ctx, conf);

    installPostGuard(emitter);

    if (!ctx.firstListen) ctx.lastSeqId = null;
    ctx.syncToken = undefined;
    ctx.t_mqttCalled = false;

    // Set up auto-cycle timer
    if (ctx._autoCycleTimer) {
      clearInterval(ctx._autoCycleTimer);
      ctx._autoCycleTimer = null;
    }
    if (conf.cycleMs && conf.cycleMs > 0) {
      ctx._autoCycleTimer = setInterval(() => forceCycle(emitter), conf.cycleMs);
      logger.info(`mqtt auto-cycle enabled ${conf.cycleMs}ms`);
    } else {
      logger.info("mqtt auto-cycle disabled");
    }

    // Start listening
    if (!ctx.firstListen || !ctx.lastSeqId) {
      getSeqIDWrapper(emitter);
    } else {
      logger.info("mqtt starting connectMqtt");
      connectMqtt(defaultFuncs, api, ctx, emitter);
    }

    // Attach methods to api for convenience
    api.stopListening = emitter.stopListening.bind(emitter);
    api.stopListeningAsync = emitter.stopListeningAsync.bind(emitter);

    // Expose middleware API
    api.useMiddleware = function (middlewareFn, fn) {
      return middleware.use(middlewareFn, fn);
    };
    api.removeMiddleware = function (identifier) {
      return middleware.remove(identifier);
    };
    api.clearMiddleware = function () {
      return middleware.clear();
    };
    api.listMiddleware = function () {
      return middleware.list();
    };
    api.setMiddlewareEnabled = function (name, enabled) {
      return middleware.setEnabled(name, enabled);
    };
    Object.defineProperty(api, "middlewareCount", {
      get: function () { return middleware.count; }
    });

    return emitter;
  };
};