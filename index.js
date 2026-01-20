/**
 * Facebook Messenger Bot
 * A modular bot using fca-unofficial library with event-driven architecture
 * @module fb-bot
 */

import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import login from "./lib/fca-unofficial/index.js";

// ============================================================================
// ES MODULE HELPERS
// ============================================================================

/** Current file's directory path (ESM equivalent of __dirname) */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  /** Path to the commands directory */
  commandsPath: join(__dirname, "modules", "commands"),
  /** Path to the events directory */
  eventsPath: join(__dirname, "modules", "events"),
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
// COMMAND LOADER
// ============================================================================

/**
 * Dynamically load all command modules from the commands directory
 * @param {string} commandsPath - Path to the commands directory
 * @returns {Promise<Map<string, Object>>} Map of command name to module
 */
async function loadCommands(commandsPath) {
  const commands = new Map();

  // Ensure commands directory exists
  if (!fs.existsSync(commandsPath)) {
    Logger.warn(`Commands directory not found: ${commandsPath}`);
    fs.mkdirSync(commandsPath, { recursive: true });
    Logger.info(`Created commands directory: ${commandsPath}`);
    return commands;
  }

  try {
    const files = await fs.promises.readdir(commandsPath);
    const jsFiles = files.filter((file) => file.endsWith(".js"));

    for (const file of jsFiles) {
      try {
        const filePath = join(commandsPath, file);
        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(fileUrl);

        // Validate module has required config
        if (!module.config || !module.config.name) {
          Logger.warn(`Skipping ${file}: missing config.name`);
          continue;
        }

        // Validate module has at least one handler
        if (typeof module.onStart !== "function" && typeof module.onChat !== "function") {
          Logger.warn(`Skipping ${file}: missing onStart or onChat handler`);
          continue;
        }

        const commandName = module.config.name.toLowerCase();
        commands.set(commandName, module);
        Logger.info(`Loaded command: ${commandName}`);
      } catch (loadError) {
        Logger.error(`Failed to load command file: ${file}`, loadError);
      }
    }

    Logger.success(`Loaded ${commands.size} command(s)`);
  } catch (error) {
    Logger.error("Failed to read commands directory", error);
  }

  return commands;
}

// ============================================================================
// EVENT LOADER
// ============================================================================

/**
 * Dynamically load all event modules from the events directory
 * @param {string} eventsPath - Path to the events directory
 * @returns {Promise<Map<string, Object[]>>} Map of eventType to array of modules
 */
async function loadEvents(eventsPath) {
  const events = new Map();

  // Ensure events directory exists
  if (!fs.existsSync(eventsPath)) {
    Logger.warn(`Events directory not found: ${eventsPath}`);
    fs.mkdirSync(eventsPath, { recursive: true });
    Logger.info(`Created events directory: ${eventsPath}`);
    return events;
  }

  try {
    const files = await fs.promises.readdir(eventsPath);
    const jsFiles = files.filter((file) => file.endsWith(".js"));

    for (const file of jsFiles) {
      try {
        const filePath = join(eventsPath, file);
        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(fileUrl);

        // Validate module has required config
        if (!module.config || !module.config.name) {
          Logger.warn(`Skipping event ${file}: missing config.name`);
          continue;
        }

        // Validate module has eventType array
        if (!module.config.eventType || !Array.isArray(module.config.eventType)) {
          Logger.warn(`Skipping event ${file}: missing or invalid config.eventType`);
          continue;
        }

        // Validate module has onStart handler
        if (typeof module.onStart !== "function") {
          Logger.warn(`Skipping event ${file}: missing onStart handler`);
          continue;
        }

        // Register module for each event type it handles
        for (const eventType of module.config.eventType) {
          if (!events.has(eventType)) {
            events.set(eventType, []);
          }
          events.get(eventType).push(module);
          Logger.info(`Loaded event: ${module.config.name} -> ${eventType}`);
        }
      } catch (loadError) {
        Logger.error(`Failed to load event file: ${file}`, loadError);
      }
    }

    const totalHandlers = Array.from(events.values()).reduce((sum, arr) => sum + arr.length, 0);
    Logger.success(`Loaded ${totalHandlers} event handler(s) for ${events.size} event type(s)`);
  } catch (error) {
    Logger.error("Failed to read events directory", error);
  }

  return events;
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

/**
 * Handle incoming message events
 * Executes onChat for all commands, then onStart for prefix commands
 * @param {Object} api - The Facebook API object
 * @param {Object} event - The message event object
 * @param {Map<string, Object>} commands - Map of loaded commands
 * @returns {Promise<void>}
 */
async function handleMessage(api, event, commands) {
  // Build context object for handlers
  const baseContext = {
    api,
    event,
    commands,
    prefix: CONFIG.prefix,
  };

  // Execute onChat for all commands (no prefix required)
  for (const [name, module] of commands) {
    if (typeof module.onChat === "function") {
      try {
        await module.onChat(baseContext);
      } catch (error) {
        Logger.error(`onChat error in "${name}"`, error);
      }
    }
  }

  // Check for prefix command
  if (!event.body) return;

  const parsed = parseCommand(event.body);
  if (!parsed) return;

  const commandModule = commands.get(parsed.command);

  // Command not found - notify user
  if (!commandModule) {
    api.sendMessage(
      `❓ Command not found: "${CONFIG.prefix}${parsed.command}"\n\nType ${CONFIG.prefix}help to see available commands.`,
      event.threadID
    );
    return;
  }

  // Command found but has no onStart handler
  if (typeof commandModule.onStart !== "function") {
    return;
  }

  // Execute the command
  try {
    await commandModule.onStart({
      ...baseContext,
      args: parsed.args,
      raw: parsed.raw,
    });
  } catch (error) {
    Logger.error(`Command "${parsed.command}" failed`, error);
    api.sendMessage(
      "An error occurred while processing your command.",
      event.threadID
    );
  }
}

// ============================================================================
// EVENT HANDLER
// ============================================================================

/**
 * Handle incoming thread events (join, leave, etc.)
 * Routes events to appropriate event modules based on logMessageType
 * @param {Object} api - The Facebook API object
 * @param {Object} event - The event object
 * @param {Map<string, Object[]>} events - Map of eventType to array of modules
 * @returns {Promise<void>}
 */
async function handleEvent(api, event, events) {
  // Validate event has required properties
  if (!event || !event.logMessageType) {
    return;
  }

  const eventType = event.logMessageType;

  // Find modules that handle this event type
  const handlers = events.get(eventType);

  if (!handlers || handlers.length === 0) {
    // No handlers for this event type - that's okay, just log it
    Logger.event("📢", `Unhandled event: ${eventType}`);
    return;
  }

  // Build context object for handlers
  const context = {
    api,
    event,
  };

  // Execute all handlers for this event type
  for (const module of handlers) {
    try {
      await module.onStart(context);
    } catch (error) {
      Logger.error(`Event handler "${module.config.name}" failed for ${eventType}`, error);
    }
  }
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

/**
 * Set up all event listeners for the MQTT listener
 * @param {Object} listener - The MQTT listener object
 * @param {Object} api - The Facebook API object
 * @param {Map<string, Object>} commands - Map of loaded commands
 * @param {Map<string, Object[]>} events - Map of loaded event handlers
 */
function setupEventListeners(listener, api, commands, events) {
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
  listener.on("message", async (event) => {
    await handleMessage(api, event, commands);
  });

  listener.on("message_reply", async (event) => {
    await handleMessage(api, event, commands);
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

  // Thread events - Route to event handlers
  listener.on("event", async (data) => {
    Logger.event("📢", `Event: ${data.logMessageType}`);
    await handleEvent(api, data, events);
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

  // Load commands
  const commands = await loadCommands(CONFIG.commandsPath);

  // Load events
  const events = await loadEvents(CONFIG.eventsPath);

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

      // Set up all event handlers (pass events map)
      setupEventListeners(listener, api, commands, events);

      Logger.success("Bot initialized successfully!");
      resolve({ api, listener, commands, events });
    });
  });
}

// Run the bot
startBot().catch((error) => {
  Logger.fatal("Failed to start bot", error);
  process.exit(1);
});