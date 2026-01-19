const chalk = require("chalk");

const co = chalk.hex("#007bff");

function formatArgs(...args) {
  return args.map(arg => {
    if (typeof arg === "string") {
      return co(arg);
    }

    return arg
  });
}

/**
 * Logger object with predefined methods for common log levels.
 * Uses Proxy to support dynamic custom log types.
 * 
 * @example
 * logger.info("Server started", { port: 3000 });
 * logger.warn("Deprecated API", "use v2 instead");
 * logger.error("Failed to connect", error);
 * logger.customType("Any custom type works dynamically");
 */
const loggerTarget = {
  /**
   * Log warning messages
   * @param {...any} args - Arguments to log
   */
  warn: function(...args) {
    console.warn(co(`[ FCA-WARN ] >`), ...formatArgs(...args));
  },

  /**
   * Log error messages
   * @param {...any} args - Arguments to log
   */
  error: function(...args) {
    console.error(chalk.bold.hex("#ff0000")(`[ FCA-ERROR ] >`), ...formatArgs(...args));
  },

  /**
   * Log info messages (default)
   * @param {...any} args - Arguments to log
   */
  info: function(...args) {
    console.info(chalk.bold(co(`[ FCA-UNO ] >`)), ...formatArgs(...args));
  }
};

/**
 * Proxy handler that intercepts property access.
 * If the property exists on loggerTarget, return it.
 * Otherwise, dynamically create a logging function for the custom type.
 */
const loggerHandler = {
  /**
   * Intercept property access on the logger object
   * @param {Object} target - The target object (loggerTarget)
   * @param {string|symbol} prop - The property being accessed
   * @param {Object} receiver - The proxy or object that inherits from proxy
   * @returns {Function} The logging function for the requested type
   */
  get: function(target, prop, receiver) {
    // If the property exists on target, return it
    if (prop in target) {
      return Reflect.get(target, prop, receiver);
    }

    // For any other property (custom types), return a dynamic logging function
    // This allows logger.customType(...args) to work for any type name
    if (typeof prop === "string") {
      return function(...args) {
        const typeLabel = prop.toUpperCase();
        console.log(chalk.bold(co(`[ ${typeLabel} ] >`)), ...formatArgs(...args));
      };
    }

    // For symbols or other non-string props, return undefined
    return undefined;
  }
};

/**
 * Logger instance with Proxy support for dynamic log types
 * 
 * Built-in types: info, warn, error
 * Dynamic types: Any property access creates a custom logger
 * 
 * @example
 * logger.info("message", data);     // [ FCA-UNO ] > message { data }
 * logger.warn("warning", obj);      // [ FCA-WARN ] > warning { obj }
 * logger.error("error", err);       // [ FCA-ERROR ] > error Error
 * logger.mqtt("custom", data);      // [ MQTT ] > custom { data }
 * logger.debug("debugging", val);   // [ DEBUG ] > debugging val
 */
const logger = new Proxy(loggerTarget, loggerHandler);

module.exports = logger;