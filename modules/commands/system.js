/**
 * System Command Module
 * Displays bot system information including uptime, memory, and platform details
 * @module commands/system
 */

import moment from "moment-timezone";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Formats uptime seconds into human-readable string (Xh Xm Xs)
 * @param {number} uptimeSeconds - Uptime in seconds from process.uptime()
 * @returns {string} Formatted uptime string
 */
function formatUptime(uptimeSeconds) {
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Formats bytes into megabytes with one decimal place
 * @param {number} bytes - Memory in bytes
 * @returns {string} Formatted memory string with MB suffix
 */
function formatMemory(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(1)} MB`;
}

// ============================================================================
// COMMAND CONFIGURATION
// ============================================================================

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "system",
  description: "View bot system information",
};

// ============================================================================
// COMMAND HANDLER
// ============================================================================

/**
 * Handles the /system command
 * Displays system information including uptime, Node.js version, memory usage,
 * platform, and current date/time in Asia/Manila timezone
 * @param {Object} context - The command context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The message event object
 * @returns {Promise<void>}
 */
export const onStart = async ({ api, event }) => {
  const { threadID, messageID } = event;

  try {
    // Gather system information
    const uptime = formatUptime(process.uptime());
    const nodeVersion = process.version;
    const memory = formatMemory(process.memoryUsage().rss);
    const platform = `${process.platform} ${process.arch}`;
    const time = moment().tz("Asia/Manila").format("LLL");

    // Build system info message
    const systemInfo = [
      "🖥️ Bot System Information",
      "",
      `• Uptime: ${uptime}`,
      `• Node.js: ${nodeVersion}`,
      `• Memory: ${memory}`,
      `• Platform: ${platform}`,
      `• Date: ${time}`,
    ].join("\n");

    // Send system info as reply to the command message
    api.sendMessage(systemInfo, threadID, messageID);
  } catch (error) {
    console.error("❌ Error in /system command:", error);
    api.sendMessage(
      "❌ An error occurred while fetching system information.",
      threadID,
      messageID
    );
  }
};