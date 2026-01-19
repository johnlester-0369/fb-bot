"use strict";

/**
 * Factory function to create emitAuth handler
 * @param {Object} deps - Dependencies
 * @returns {Function} emitAuth function
 */
module.exports = function createEmitAuth({ logger }) {
  /**
   * Emit authentication error and clean up resources
   * @param {Object} ctx - Context object
   * @param {Object} api - API object
   * @param {EventEmitter} emitter - Event emitter
   * @param {string} reason - Error reason
   * @param {string} detail - Error detail message
   */
  return function emitAuth(ctx, api, emitter, reason, detail) {
    // Clean up all timers
    try {
      if (ctx._autoCycleTimer) {
        clearInterval(ctx._autoCycleTimer);
        ctx._autoCycleTimer = null;
      }
    } catch (_) { }
    try {
      if (ctx._reconnectTimer) {
        clearTimeout(ctx._reconnectTimer);
        ctx._reconnectTimer = null;
      }
    } catch (_) { }

    try {
      ctx._ending = true;
      ctx._cycling = false;
    } catch (_) { }

    // Clean up MQTT client
    try {
      if (ctx.mqttClient) {
        ctx.mqttClient.removeAllListeners();
        if (ctx.mqttClient.connected) {
          ctx.mqttClient.end(true);
        }
      }
    } catch (_) { }

    ctx.mqttClient = undefined;
    ctx.loggedIn = false;

    // Clean up timeout references
    try {
      if (ctx._rTimeout) {
        clearTimeout(ctx._rTimeout);
        ctx._rTimeout = null;
      }
    } catch (_) { }

    // Clean up tasks Map to prevent memory leak
    try {
      if (ctx.tasks && ctx.tasks instanceof Map) {
        ctx.tasks.clear();
      }
    } catch (_) { }

    // Clean up userInfo intervals
    try {
      if (ctx._userInfoIntervals && Array.isArray(ctx._userInfoIntervals)) {
        ctx._userInfoIntervals.forEach(interval => {
          try {
            clearInterval(interval);
          } catch (_) { }
        });
        ctx._userInfoIntervals = [];
      }
    } catch (_) { }

    // Clean up autoSave intervals
    try {
      if (ctx._autoSaveInterval && Array.isArray(ctx._autoSaveInterval)) {
        ctx._autoSaveInterval.forEach(interval => {
          try {
            clearInterval(interval);
          } catch (_) { }
        });
        ctx._autoSaveInterval = [];
      }
    } catch (_) { }

    // Clean up scheduler
    try {
      if (ctx._scheduler && typeof ctx._scheduler.destroy === "function") {
        ctx._scheduler.destroy();
        ctx._scheduler = undefined;
      }
    } catch (_) { }

    // Clear global mqttClient reference if set
    try {
      if (global.mqttClient) {
        delete global.mqttClient;
      }
    } catch (_) { }

    const msg = detail || reason;
    logger.error(`auth change -> ${reason}: ${msg}`);

    // Emit fatal event to emitter
    if (emitter && typeof emitter.emit === "function") {
      try {
        emitter.emit("fatal", {
          type: "auth_error",
          reason,
          error: msg,
          timestamp: Date.now()
        });
      } catch (emitErr) {
        logger.error(`emitAuth emit error:`, emitErr);
      }
    }
  };
};