/**
 * Hi Command Module
 * Greets the user when /hi is sent
 * @module commands/hi
 */

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "hi",
  description: "Greets the user",
};

/**
 * Handles the /hi command
 * @param {Object} context - The command context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The message event object
 * @returns {Promise<void>}
 */
export const onStart = async ({ api, event }) => {
  api.sendMessage("Hello! 👋", event.threadID);
};