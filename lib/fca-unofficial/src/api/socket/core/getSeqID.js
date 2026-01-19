"use strict";
const { getType } = require("../../../utils/format");
const { parseAndCheckLogin } = require("../../../utils/client");

/**
 * Factory function to create getSeqID handler
 * @param {Object} deps - Dependencies
 * @returns {Function} getSeqID function
 */
module.exports = function createGetSeqID(deps) {
  const { listenMqtt, logger, emitAuth } = deps;

  /**
   * Get sequence ID and start MQTT listener
   * @param {Object} defaultFuncs - Default functions
   * @param {Object} api - API object
   * @param {Object} ctx - Context object
   * @param {EventEmitter} emitter - Event emitter
   * @param {Object} form - Form data for request
   * @returns {Promise}
   */
  return function getSeqID(defaultFuncs, api, ctx, emitter, form) {
    ctx.t_mqttCalled = false;
    return defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(resData => {
        if (getType(resData) !== "Array") throw { error: "Not logged in" };
        if (!Array.isArray(resData) || !resData.length) return;
        const lastRes = resData[resData.length - 1];
        if (lastRes && lastRes.successful_results === 0) return;

        const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
        if (syncSeqId) {
          ctx.lastSeqId = syncSeqId;
          logger.info("mqtt getSeqID ok -> listenMqtt()");
          listenMqtt(defaultFuncs, api, ctx, emitter);
        } else {
          throw { error: "getSeqId: no sync_sequence_id found." };
        }
      })
      .catch(err => {
        const detail = (err && err.detail && err.detail.message) ? ` | detail=${err.detail.message}` : "";
        const msg = ((err && err.error) || (err && err.message) || String(err || "")) + detail;
        if (/Not logged in/i.test(msg)) {
          return emitAuth(ctx, api, emitter, "not_logged_in", msg);
        }
        if (/blocked the login/i.test(msg)) {
          return emitAuth(ctx, api, emitter, "login_blocked", msg);
        }
        logger.error(`getSeqID error:`, err);
        // Emit error event for non-fatal errors
        if (emitter && typeof emitter.emit === "function") {
          emitter.emit("error", {
            type: "seq_id_error",
            error: msg,
            timestamp: Date.now()
          });
        }
        return emitAuth(ctx, api, emitter, "auth_error", msg);
      });
  };
};