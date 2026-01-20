/**
 * Logger Command Module
 * Logs all incoming messages to console (no prefix required)
 * @module commands/logger
 */

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "logger",
  description: "Logs all incoming messages to console",
};

/**
 * Handles all incoming messages (no prefix required)
 * Logs message details to console with emoji prefix
 * @param {Object} context - The command context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The message event object
 * @returns {Promise<void>}
 */
export const onChat = async ({ api, event }) => {
  const body = event.body || "[Attachment/Media]";
  console.log(`💬 ${event.threadID} | ${event.senderID}: ${body}`);
};