/**
 * Ping Command Module
 * Checks if the bot is alive with latency info
 * @module commands/ping
 */

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "ping",
  description: "Check if bot is alive",
};

/**
 * Handles the /ping command
 * Responds with pong and latency measurement
 * @param {Object} context - The command context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The message event object
 * @returns {Promise<void>}
 */
export const onStart = async ({ api, event }) => {
  const start = Date.now();
  api.sendMessage(`🏓 Pong! Latency: ${Date.now() - start}ms`, event.threadID);
};