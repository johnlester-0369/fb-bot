/**
 * Goodbye Event Module
 * Sends a goodbye message when members leave the group
 * @module events/goodbye
 */

/**
 * Event configuration
 * @type {Object}
 */
export const config = {
  name: "goodbye",
  description: "Sends a goodbye message when members leave the group",
  eventType: ["log:unsubscribe"],
};

/**
 * Handles the log:unsubscribe event (member leaves)
 * @param {Object} context - The event context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The event object
 * @returns {Promise<void>}
 */
export const onStart = async ({ api, event }) => {
  try {
    const { threadID, logMessageData, author } = event;

    // Validate event data
    if (!logMessageData || !logMessageData.leftParticipantFbId) {
      return;
    }

    const leftUserId = logMessageData.leftParticipantFbId.toString();

    // Fetch user information for the person who left
    api.getUserInfo([leftUserId], (err, users) => {
      if (err) {
        console.error("❌ Failed to get user info for goodbye message:", err);
        // Still send a generic message
        api.sendMessage(
          `👋 A member has left the group. Goodbye!`,
          threadID
        );
        return;
      }

      const user = users[leftUserId];
      const userName = user ? user.name : `User ${leftUserId}`;

      // Determine if user left voluntarily or was removed
      const wasRemoved = author && author !== leftUserId;

      let goodbyeMessage;
      if (wasRemoved) {
        goodbyeMessage = `👋 ${userName} has been removed from the group.`;
      } else {
        goodbyeMessage = `👋 ${userName} has left the group. Goodbye!`;
      }

      // Send goodbye message
      api.sendMessage(goodbyeMessage, threadID, (sendErr) => {
        if (sendErr) {
          console.error("❌ Failed to send goodbye message:", sendErr);
        }
      });
    });
  } catch (error) {
    console.error("❌ Error in goodbye event handler:", error);
  }
};