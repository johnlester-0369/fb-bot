import fs from "fs";
import login from "./lib/fca-unofficial/index.js";

const PREFIX = "/";

const listenOptions = {
  listenEvents: true, // Receive events (join/leave, rename, etc.)
  selfListen: false, // Receive messages from yourself
  logLevel: "silent", // Disable logs (silent/error/warn/info/verbose)
};

/**
 * Check if message starts with prefix
 * @param {string} message - Message body
 * @returns {boolean}
 */
function isPrefix(message) {
  return message.startsWith(PREFIX);
}

/**
 * Check if message is a specific command
 * @param {string} message - Message body
 * @param {string} command - Command name
 * @returns {boolean}
 */
function isCommand(message, command) {
  return (
    message === PREFIX + command || message.startsWith(PREFIX + command + " ")
  );
}

if (!fs.existsSync("appstate.json")) {
  console.log("Creating appstate.json...");
  fs.writeFileSync("appstate.json", "[]");
  console.log("Put your Facebook session cookies in appstate.json and run the bot.");
  process.exit(0);
}

console.log("Bot starting...");

login(
  { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
  (err, api) => {
    if (err) {
      console.error("Login Error:", err);
      return;
    }

    api.setOptions(listenOptions);

    // Use the new EventEmitter pattern
    const listener = api.listenMqtt();

    // Lifecycle events
    listener.on("connected", () => {
      console.log("✅ MQTT Connected!");
    });

    listener.on("disconnected", (reason, willReconnect) => {
      console.log(`⚠️ Disconnected: ${reason}, will reconnect: ${willReconnect}`);
    });

    listener.on("reconnecting", (attempt) => {
      console.log(`🔄 Reconnecting... attempt ${attempt}`);
    });

    listener.on("closed", () => {
      console.log("🛑 Listener closed");
    });

    // Error events
    listener.on("error", (err) => {
      console.error("❌ Non-fatal error:", err);
    });

    listener.on("fatal", (err) => {
      console.error("💀 Fatal error:", err);
      console.error("Bot needs to restart...");
      process.exit(1);
    });

    // Message events
    listener.on("message", (msg) => {
      if (!msg.body || !isPrefix(msg.body)) return; // ignore non-prefix

      if (isCommand(msg.body, "hi")) {
        api.sendMessage("Hello!", msg.threadID);
      }
    });

    listener.on("message_reply", (msg) => {
      console.log(`📩 Reply from ${msg.senderID}: ${msg.body}`);
    });

    listener.on("message_reaction", (data) => {
      console.log(`👍 Reaction: ${data.reaction} on message ${data.messageID}`);
    });

    listener.on("message_unsend", (data) => {
      console.log(`🗑️ Message unsent: ${data.messageID}`);
    });

    // Typing and presence
    listener.on("typing", (data) => {
      if (data.isTyping) {
        console.log(`⌨️ ${data.from} is typing in ${data.threadID}`);
      }
    });

    listener.on("presence", (data) => {
      console.log(`👤 Presence update for ${data.userID}`);
    });

    listener.on("read_receipt", (data) => {
      console.log(`👀 ${data.reader} read messages in ${data.threadID}`);
    });

    // Thread events (admin text messages, name changes, etc.)
    listener.on("event", (data) => {
      console.log(`📢 Event: ${data.logMessageType}`);
    });

    // Friend requests
    listener.on("friend_request_received", (data) => {
      console.log(`👋 Friend request from ${data.actorFbId}`);
    });

    listener.on("friend_request_cancel", (data) => {
      console.log(`❌ Friend request canceled by ${data.actorFbId}`);
    });
  }
);