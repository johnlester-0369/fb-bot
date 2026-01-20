/**
 * Welcome Event Module
 * Sends a welcome message when members join the group
 * @module events/welcome
 */

/**
 * Event configuration
 * @type {Object}
 */
export const config = {
  name: "welcome",
  description: "Sends a welcome message when members join the group",
  eventType: ["log:subscribe"],
};

/**
 * Handles the log:subscribe event (member joins)
 * @param {Object} context - The event context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The event object
 * @returns {Promise<void>}
 */
export const onStart = async ({ api, event }) => {
  try {
    const { threadID, logMessageData, author } = event;

    // Validate event data
    if (!logMessageData || !logMessageData.addedParticipants) {
      return;
    }

    const addedParticipants = logMessageData.addedParticipants;

    // Skip if no participants were added
    if (!Array.isArray(addedParticipants) || addedParticipants.length === 0) {
      return;
    }

    // Get user info for the added participants
    const participantIds = addedParticipants.map((p) => {
      // Handle both object format and string format
      if (typeof p === "object" && p.userFbId) {
        return p.userFbId.toString();
      }
      return p.toString();
    });

    // Fetch user information
    api.getUserInfo(participantIds, (err, users) => {
      if (err) {
        console.error("❌ Failed to get user info for welcome message:", err);
        return;
      }

      // Build welcome message
      const names = participantIds.map((id) => {
        const user = users[id];
        return user ? user.name : `User ${id}`;
      });

      const welcomeMessage =
        names.length === 1
          ? `👋 Welcome to the group, ${names[0]}!`
          : `👋 Welcome to the group!\n\n${names.map((name) => `• ${name}`).join("\n")}`;

      // Send welcome message
      api.sendMessage(welcomeMessage, threadID, (sendErr) => {
        if (sendErr) {
          console.error("❌ Failed to send welcome message:", sendErr);
        }
      });
    });
  } catch (error) {
    console.error("❌ Error in welcome event handler:", error);
  }
};