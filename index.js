/**
 * Facebook Messenger Bot
 * A simple bot using fca-unofficial library with event-driven architecture
 * @module fb-bot
 */

import fs from "fs";
import login from "./lib/fca-unofficial/index.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Bot configuration object
 * @constant {Object}
 */
const CONFIG = {
  /** Command prefix for bot commands */
  prefix: "/",
  /** Path to the appstate file */
  appStatePath: "appstate.json",
  /** MQTT listener options */
  listenOptions: {
    listenEvents: true,
    selfListen: false,
    logLevel: "silent",
  },
};

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Simple logger with emoji prefixes for better visibility
 * @constant {Object}
 */
const Logger = {
  /**
   * Log informational message
   * @param {string} message - Message to log
   */
  info: (message) => console.log(`ℹ️  ${message}`),

  /**
   * Log success message
   * @param {string} message - Message to log
   */
  success: (message) => console.log(`✅ ${message}`),

  /**
   * Log warning message
   * @param {string} message - Message to log
   */
  warn: (message) => console.warn(`⚠️  ${message}`),

  /**
   * Log error message
   * @param {string} message - Message to log
   * @param {Error} [error] - Optional error object
   */
  error: (message, error) => {
    console.error(`❌ ${message}`);
    if (error) console.error(error);
  },

  /**
   * Log fatal error message
   * @param {string} message - Message to log
   * @param {Error} [error] - Optional error object
   */
  fatal: (message, error) => {
    console.error(`💀 ${message}`);
    if (error) console.error(error);
  },

  /**
   * Log event message
   * @param {string} emoji - Emoji prefix
   * @param {string} message - Message to log
   */
  event: (emoji, message) => console.log(`${emoji} ${message}`),
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a message starts with the configured prefix
 * @param {string} message - The message body to check
 * @returns {boolean} True if message starts with prefix
 */
function hasPrefix(message) {
  return typeof message === "string" && message.startsWith(CONFIG.prefix);
}

/**
 * Parse command and arguments from a message
 * @param {string} message - The message body to parse
 * @returns {{ command: string, args: string[], raw: string } | null} Parsed command object or null
 */
function parseCommand(message) {
  if (!hasPrefix(message)) return null;

  const withoutPrefix = message.slice(CONFIG.prefix.length).trim();
  const parts = withoutPrefix.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return {
    command,
    args,
    raw: withoutPrefix,
  };
}

/**
 * Load appstate from file
 * @returns {Array|null} Parsed appstate or null if not found/invalid
 */
function loadAppState() {
  try {
    if (!fs.existsSync(CONFIG.appStatePath)) {
      return null;
    }
    const data = fs.readFileSync(CONFIG.appStatePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    Logger.error("Failed to load appstate", error);
    return null;
  }
}

/**
 * Initialize appstate file if it doesn't exist
 * @returns {boolean} True if initialization was needed and performed
 */
function initializeAppState() {
  if (fs.existsSync(CONFIG.appStatePath)) {
    return false;
  }

  Logger.info("Creating appstate.json...");
  fs.writeFileSync(CONFIG.appStatePath, "[]");
  Logger.info("Put your Facebook session cookies in appstate.json and run the bot.");
  return true;
}

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

/**
 * @typedef {Object} CommandContext
 * @property {Object} api - The Facebook API object
 * @property {Object} msg - The message object
 * @property {string[]} args - Command arguments
 * @property {string} raw - Raw command string without prefix
 */

/**
 * @typedef {Function} CommandHandler
 * @param {CommandContext} context - The command context
 * @returns {Promise<void>}
 */

/**
 * Command registry - Map of command names to their handlers
 * @type {Map<string, { handler: CommandHandler, description: string }>}
 */
const commands = new Map();

/**
 * Register a new command
 * @param {string} name - Command name (without prefix)
 * @param {string} description - Command description
 * @param {CommandHandler} handler - Command handler function
 */
function registerCommand(name, description, handler) {
  commands.set(name.toLowerCase(), { handler, description });
}

/**
 * Execute a command if it exists
 * @param {Object} api - The Facebook API object
 * @param {Object} msg - The message object
 * @returns {Promise<boolean>} True if command was executed
 */
async function executeCommand(api, msg) {
  if (!msg.body) return false;

  const parsed = parseCommand(msg.body);
  if (!parsed) return false;

  const commandEntry = commands.get(parsed.command);
  if (!commandEntry) return false;

  try {
    await commandEntry.handler({
      api,
      msg,
      args: parsed.args,
      raw: parsed.raw,
    });
    return true;
  } catch (error) {
    Logger.error(`Command "${parsed.command}" failed`, error);
    api.sendMessage(
      "An error occurred while processing your command.",
      msg.threadID
    );
    return false;
  }
}

// ============================================================================
// COMMAND DEFINITIONS
// ============================================================================

// Register: /hi
registerCommand("hi", "Greets the user", async ({ api, msg }) => {
  api.sendMessage("Hello! 👋", msg.threadID);
});

// Register: /help
registerCommand("help", "Shows available commands", async ({ api, msg }) => {
  const commandList = Array.from(commands.entries())
    .map(([name, { description }]) => `${CONFIG.prefix}${name} - ${description}`)
    .join("\n");

  api.sendMessage(`📚 Available Commands:\n\n${commandList}`, msg.threadID);
});

// Register: /ping
registerCommand("ping", "Check if bot is alive", async ({ api, msg }) => {
  const start = Date.now();
  api.sendMessage(`🏓 Pong! Latency: ${Date.now() - start}ms`, msg.threadID);
});

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Set up all event listeners for the MQTT listener
 * @param {Object} listener - The MQTT listener object
 * @param {Object} api - The Facebook API object
 */
function setupEventListeners(listener, api) {
  // Lifecycle events
  listener.on("connected", () => {
    Logger.success("MQTT Connected!");
  });

  listener.on("disconnected", (reason, willReconnect) => {
    Logger.warn(`Disconnected: ${reason}, will reconnect: ${willReconnect}`);
  });

  listener.on("reconnecting", (attempt) => {
    Logger.event("🔄", `Reconnecting... attempt ${attempt}`);
  });

  listener.on("closed", () => {
    Logger.event("🛑", "Listener closed");
  });

  // Error events
  listener.on("error", (err) => {
    Logger.error("Non-fatal error", err);
  });

  listener.on("fatal", (err) => {
    Logger.fatal("Fatal error - Bot needs to restart", err);
    gracefulShutdown(1);
  });

  // Message events
  listener.on("message", (msg) => {
    executeCommand(api, msg);
  });

  listener.on("message_reply", (msg) => {
    executeCommand(api, msg);
  });

  listener.on("message_reaction", (data) => {
    Logger.event("👍", `Reaction: ${data.reaction} on message ${data.messageID}`);
  });

  listener.on("message_unsend", (data) => {
    Logger.event("🗑️", `Message unsent: ${data.messageID}`);
  });

  // Typing and presence
  listener.on("typing", (data) => {
    if (data.isTyping) {
      Logger.event("⌨️", `${data.from} is typing in ${data.threadID}`);
    }
  });

  listener.on("presence", (data) => {
    Logger.event("👤", `Presence update for ${data.userID}`);
  });

  listener.on("read_receipt", (data) => {
    Logger.event("👀", `${data.reader} read messages in ${data.threadID}`);
  });

  // Thread events
  listener.on("event", (data) => {
    Logger.event("📢", `Event: ${data.logMessageType}`);
  });

  // Friend requests
  listener.on("friend_request_received", (data) => {
    Logger.event("👋", `Friend request from ${data.actorFbId}`);
  });

  listener.on("friend_request_cancel", (data) => {
    Logger.event("❌", `Friend request canceled by ${data.actorFbId}`);
  });
}

// ============================================================================
// SHUTDOWN HANDLING
// ============================================================================

/** @type {Object|null} Reference to active listener for cleanup */
let activeListener = null;

/**
 * Perform graceful shutdown
 * @param {number} [exitCode=0] - Exit code
 */
function gracefulShutdown(exitCode = 0) {
  Logger.info("Shutting down gracefully...");

  if (activeListener) {
    try {
      activeListener.removeAllListeners();
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  process.exit(exitCode);
}

// Handle process signals
process.on("SIGINT", () => {
  Logger.info("Received SIGINT");
  gracefulShutdown(0);
});

process.on("SIGTERM", () => {
  Logger.info("Received SIGTERM");
  gracefulShutdown(0);
});

process.on("uncaughtException", (error) => {
  Logger.fatal("Uncaught exception", error);
  gracefulShutdown(1);
});

process.on("unhandledRejection", (reason, promise) => {
  Logger.error("Unhandled rejection at:", promise);
  Logger.error("Reason:", reason);
});

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Start the Facebook bot
 * @returns {Promise<void>}
 */
async function startBot() {
  // Initialize appstate if needed
  if (initializeAppState()) {
    process.exit(0);
  }

  // Load appstate
  const appState = loadAppState();
  if (!appState) {
    Logger.error("Failed to load appstate. Please check appstate.json");
    process.exit(1);
  }

  Logger.info("Bot starting...");

  // Wrap login in a Promise for async/await
  return new Promise((resolve, reject) => {
    login({ appState }, (err, api) => {
      if (err) {
        Logger.error("Login failed", err);
        reject(err);
        return;
      }

      // Apply listener options
      api.setOptions(CONFIG.listenOptions);

      // Start MQTT listener
      const listener = api.listenMqtt();
      activeListener = listener;

      // Set up all event handlers
      setupEventListeners(listener, api);

      Logger.success("Bot initialized successfully!");
      resolve({ api, listener });
    });
  });
}

// Run the bot
startBot().catch((error) => {
  Logger.fatal("Failed to start bot", error);
  process.exit(1);
});