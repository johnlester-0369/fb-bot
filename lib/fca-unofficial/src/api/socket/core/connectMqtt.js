"use strict";
const { formatID } = require("../../../utils/format");

/**
 * Factory function to create the MQTT connection handler
 * @param {Object} deps - Dependencies
 * @returns {Function} listenMqtt function
 */
module.exports = function createListenMqtt(deps) {
  const {
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
  } = deps;

  /**
   * Connect to MQTT and listen for messages
   * @param {Object} defaultFuncs - Default functions
   * @param {Object} api - API object
   * @param {Object} ctx - Context object
   * @param {EventEmitter} emitter - Event emitter for messages
   */
  return function listenMqtt(defaultFuncs, api, ctx, emitter) {
    /**
     * Schedule a reconnection attempt
     * @param {number} [delayMs] - Delay in milliseconds
     */
    function scheduleReconnect(delayMs) {
      const d = (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 2000;
      const ms = typeof delayMs === "number" ? delayMs : d;
      if (ctx._reconnectTimer) {
        logger.warn("mqtt reconnect already scheduled");
        return;
      }
      if (ctx._ending) {
        logger.warn("mqtt reconnect skipped - ending");
        return;
      }
      ctx._reconnectAttempts = (ctx._reconnectAttempts || 0) + 1;
      logger.warn(`mqtt will reconnect in ${ms}ms (attempt ${ctx._reconnectAttempts})`);
      emitter.emit("reconnecting", ctx._reconnectAttempts);
      ctx._reconnectTimer = setTimeout(() => {
        ctx._reconnectTimer = null;
        if (!ctx._ending) {
          listenMqtt(defaultFuncs, api, ctx, emitter);
        }
      }, ms);
    }

    /**
     * Check if error indicates intentional shutdown
     * @param {string} msg - Error message
     * @returns {boolean}
     */
    function isEndingLikeError(msg) {
      return /No subscription existed|client disconnecting|socket hang up|ECONNRESET/i.test(msg || "");
    }

    const chatOn = ctx.globalOptions.online;
    const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
    const username = {
      u: ctx.userID,
      s: sessionID,
      chat_on: chatOn,
      fg: false,
      d: ctx.clientId,
      ct: "websocket",
      aid: 219994525426954,
      aids: null,
      mqtt_sid: "",
      cp: 3,
      ecp: 10,
      st: [],
      pm: [],
      dc: "",
      no_auto_fg: true,
      gas: null,
      pack: [],
      p: null,
      php_override: ""
    };

    const cookies = api.getCookies();
    let host;
    if (ctx.mqttEndpoint) {
      host = `${ctx.mqttEndpoint}&sid=${sessionID}&cid=${ctx.clientId}`;
    } else if (ctx.region) {
      host = `wss://edge-chat.facebook.com/chat?region=${ctx.region.toLowerCase()}&sid=${sessionID}&cid=${ctx.clientId}`;
    } else {
      host = `wss://edge-chat.facebook.com/chat?sid=${sessionID}&cid=${ctx.clientId}`;
    }

    const options = {
      clientId: "mqttwsclient",
      protocolId: "MQIsdp",
      protocolVersion: 3,
      username: JSON.stringify(username),
      clean: true,
      wsOptions: {
        headers: {
          Cookie: cookies,
          Origin: "https://www.facebook.com",
          "User-Agent": ctx.globalOptions.userAgent || "Mozilla/5.0",
          Referer: "https://www.facebook.com/",
          Host: "edge-chat.facebook.com",
          Connection: "Upgrade",
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "vi,en;q=0.9",
          "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits"
        },
        origin: "https://www.facebook.com",
        protocolVersion: 13,
        binaryType: "arraybuffer"
      },
      keepalive: 30,
      reschedulePings: true,
      reconnectPeriod: 0,
      connectTimeout: 5000
    };

    if (ctx.globalOptions.proxy !== undefined) {
      const agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
      options.wsOptions.agent = agent;
    }

    ctx.mqttClient = new mqtt.Client(
      () => buildStream(options, new WebSocket(host, options.wsOptions), buildProxy()),
      options
    );
    const mqttClient = ctx.mqttClient;

    if (process.env.DEBUG_MQTT) {
      global.mqttClient = mqttClient;
    }

    // Handle MQTT errors
    mqttClient.on("error", function (err) {
      const msg = String(err && err.message ? err.message : err || "");

      if ((ctx._ending || ctx._cycling) && /No subscription existed|client disconnecting/i.test(msg)) {
        logger.info(`mqtt expected during shutdown: ${msg}`);
        return;
      }

      // Auth errors are fatal
      if (/Not logged in|Not logged in.|blocked the login|401|403/i.test(msg)) {
        try {
          if (mqttClient && mqttClient.connected) {
            mqttClient.end(true);
          }
        } catch (_) { }
        return emitAuth(
          ctx,
          api,
          emitter,
          /blocked/i.test(msg) ? "login_blocked" : "not_logged_in",
          msg
        );
      }

      logger.error(`mqtt error:`, err);
      emitter.emit("error", err);

      try {
        if (mqttClient && mqttClient.connected) {
          mqttClient.end(true);
        }
      } catch (_) { }

      if (ctx._ending || ctx._cycling) return;

      if (ctx.globalOptions.autoReconnect && !ctx._ending) {
        const d = (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 2000;
        logger.warn(`mqtt autoReconnect in ${d}ms`);
        emitter.emit("disconnected", msg || "connection_error", true);
        scheduleReconnect(d);
      } else {
        emitter.emit("disconnected", msg || "connection_error", false);
        emitter.emit("fatal", { type: "connection_refused", error: msg || "Connection refused" });
      }
    });

    // Handle successful connection
    mqttClient.on("connect", function () {
      if (process.env.OnStatus === undefined) {
        logger.info("fca-unofficial premium");
        process.env.OnStatus = true;
      }
      ctx._cycling = false;
      ctx._reconnectAttempts = 0;

      // Subscribe to all topics
      topics.forEach(t => mqttClient.subscribe(t));

      // Set up sync queue
      const queue = {
        sync_api_version: 11,
        max_deltas_able_to_process: 100,
        delta_batch_size: 500,
        encoding: "JSON",
        entity_fbid: ctx.userID,
        initial_titan_sequence_id: ctx.lastSeqId,
        device_params: null
      };
      const topic = ctx.syncToken ? "/messenger_sync_get_diffs" : "/messenger_sync_create_queue";
      if (ctx.syncToken) {
        queue.last_seq_id = ctx.lastSeqId;
        queue.sync_token = ctx.syncToken;
      }
      mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });
      mqttClient.publish("/foreground_state", JSON.stringify({ foreground: chatOn }), { qos: 1 });
      mqttClient.publish("/set_client_settings", JSON.stringify({ make_user_available_when_in_foreground: true }), { qos: 1 });

      const d = (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 2000;
      let rTimeout = setTimeout(function () {
        rTimeout = null;
        if (ctx._ending) {
          logger.warn("mqtt t_ms timeout skipped - ending");
          return;
        }
        logger.warn(`mqtt t_ms timeout, cycling in ${d}ms`);
        try {
          if (mqttClient && mqttClient.connected) {
            mqttClient.end(true);
          }
        } catch (_) { }
        emitter.emit("disconnected", "sync_timeout", true);
        scheduleReconnect(d);
      }, 5000);

      ctx._rTimeout = rTimeout;

      ctx.tmsWait = function () {
        if (rTimeout) {
          clearTimeout(rTimeout);
          rTimeout = null;
        }
        if (ctx._rTimeout) {
          delete ctx._rTimeout;
        }
        // Emit connected event
        emitter.emit("connected");
        if (ctx.globalOptions.emitReady) {
          emitter.emit("ready");
        }
        delete ctx.tmsWait;
      };
    });

    // Handle incoming messages
    mqttClient.on("message", function (topic, message) {
      if (ctx._ending) return;
      try {
        let jsonMessage = Buffer.isBuffer(message) ? Buffer.from(message).toString() : message;
        try {
          jsonMessage = JSON.parse(jsonMessage);
        } catch (parseErr) {
          logger.warn(`mqtt message parse error for topic ${topic}:`, parseErr);
          jsonMessage = {};
        }

        // Friend request events
        if (jsonMessage.type === "jewel_requests_add") {
          emitter.emit("friend_request_received", {
            type: "friend_request_received",
            actorFbId: jsonMessage.from.toString(),
            timestamp: Date.now().toString()
          });
        } else if (jsonMessage.type === "jewel_requests_remove_old") {
          emitter.emit("friend_request_cancel", {
            type: "friend_request_cancel",
            actorFbId: jsonMessage.from.toString(),
            timestamp: Date.now().toString()
          });
        } else if (topic === "/t_ms") {
          // Sync messages
          if (ctx.tmsWait && typeof ctx.tmsWait === "function") ctx.tmsWait();
          if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
            ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
            ctx.syncToken = jsonMessage.syncToken;
          }
          if (jsonMessage.lastIssuedSeqId) ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
          for (const dlt of (jsonMessage.deltas || [])) {
            parseDelta(defaultFuncs, api, ctx, emitter, { delta: dlt });
          }
        } else if (topic === "/thread_typing" || topic === "/orca_typing_notifications") {
          // Typing indicator - emit as "typing" event
          const typ = {
            type: "typing",
            isTyping: !!jsonMessage.state,
            from: jsonMessage.sender_fbid.toString(),
            threadID: formatID((jsonMessage.thread || jsonMessage.sender_fbid).toString())
          };
          emitter.emit("typing", typ);
        } else if (topic === "/orca_presence") {
          // Presence updates
          if (!ctx.globalOptions.updatePresence) {
            for (const data of (jsonMessage.list || [])) {
              const presence = {
                type: "presence",
                userID: String(data.u),
                timestamp: data.l * 1000,
                statuses: data.p
              };
              emitter.emit("presence", presence);
            }
          }
        } else if (topic === "/ls_resp") {
          // Task responses
          const parsedPayload = JSON.parse(jsonMessage.payload);
          const reqID = jsonMessage.request_id;
          if (ctx["tasks"].has(reqID)) {
            const taskData = ctx["tasks"].get(reqID);
            const { type: taskType, callback: taskCallback } = taskData;
            const taskRespData = getTaskResponseData(taskType, parsedPayload);
            if (taskRespData == null) taskCallback("error", null);
            else taskCallback(null, Object.assign({ type: taskType, reqID }, taskRespData));
          }
        }
      } catch (ex) {
        logger.error(`mqtt message handler error:`, ex);
        emitter.emit("error", ex);
      }
    });

    // Handle connection close
    mqttClient.on("close", function () {
      if (ctx._ending || ctx._cycling) {
        logger.info("mqtt close expected");
        return;
      }
      logger.warn("mqtt connection closed");
      
      // Check if autoReconnect is enabled and trigger reconnection
      if (ctx.globalOptions.autoReconnect && !ctx._ending) {
        emitter.emit("disconnected", "connection_closed", true);
        scheduleReconnect();
      } else {
        emitter.emit("disconnected", "connection_closed", false);
      }
    });

    // Handle disconnect
    mqttClient.on("disconnect", () => {
      if (ctx._ending || ctx._cycling) {
        logger.info("mqtt disconnect expected");
        return;
      }
      logger.warn("mqtt disconnected");
      
      // Check if autoReconnect is enabled and trigger reconnection
      if (ctx.globalOptions.autoReconnect && !ctx._ending) {
        emitter.emit("disconnected", "disconnected", true);
        scheduleReconnect();
      } else {
        emitter.emit("disconnected", "disconnected", false);
      }
    });
  };
};