/**
 * Help Command Module
 * Shows all available commands when /help is sent
 * @module commands/help
 */

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "help",
  description: "Shows available commands",
};

/**
 * Handles the /help command
 * Lists all registered commands with their descriptions
 * @param {Object} context - The command context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The message event object
 * @param {Map} context.commands - Map of all loaded commands
 * @param {string} context.prefix - The command prefix
 * @returns {Promise<void>}
 */
export const onStart = async ({ api, event, commands, prefix }) => {
  const commandList = [];

  for (const [name, module] of commands) {
    // Only show commands that have onStart (prefix commands)
    if (typeof module.onStart === "function") {
      const description = module.config?.description || "No description";
      commandList.push(`${prefix}${name} - ${description}`);
    }
  }

  const message = commandList.length > 0
    ? `📚 Available Commands:\n\n${commandList.join("\n")}`
    : "📚 No commands available.";

  api.sendMessage(message, event.threadID);
};