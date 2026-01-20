/**
 * QR Command Module
 * Generates QR codes from text input
 * @module commands/qr
 */

import qr from "qr-image";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a QR code PNG image stream from text
 * Attaches .path property for fca-unofficial attachment compatibility
 * @param {string} text - Text to encode in QR code
 * @returns {import('stream').Readable} PNG image stream with .path property
 */
function generateQRCode(text) {
  const stream = qr.image(text, { type: "png", size: 6 });

  // Attach .path property for fca-unofficial to detect file type
  stream.path = `qr_${Date.now()}_${Math.floor(Math.random() * 999)}.png`;

  return stream;
}

// ============================================================================
// COMMAND CONFIGURATION
// ============================================================================

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "qr",
  description: "Generate QR code from text",
};

// ============================================================================
// COMMAND HANDLER
// ============================================================================

/**
 * Handles the /qr command
 * Generates and sends a QR code image from user-provided text
 * Supports reply-to-message to encode the replied message's text
 * @param {Object} context - The command context
 * @param {Object} context.api - The Facebook API object
 * @param {Object} context.event - The message event object
 * @param {string[]} context.args - Command arguments (without prefix and command name)
 * @param {string} context.prefix - The command prefix
 * @returns {Promise<void>}
 */
export const onStart = async ({ api, event, args, prefix }) => {
  const { threadID, messageID, messageReply } = event;

  /**
   * Helper function to send reply message
   * @param {string} text - Message text to send
   */
  const reply = (text) => {
    api.sendMessage(text, threadID, messageID);
  };

  try {
    // Join args into a single string
    let textToEncode = args.join(" ").trim();

    // If no text provided, check for reply message
    if (!textToEncode && messageReply) {
      textToEncode = messageReply.body || "";
    }

    // Validate: text must be provided
    if (!textToEncode) {
      const usageMessage = [
        "📱 QR Code Generator",
        "",
        "Usage:",
        `• ${prefix}qr <text> - Generate QR code from text`,
        `• Reply to a message with "${prefix}qr" - Encode replied message`,
        "",
        "Examples:",
        `• ${prefix}qr https://example.com`,
        `• ${prefix}qr Hello World!`,
        `• ${prefix}qr wifi:WPA;S:MyNetwork;P:password123;;`,
        "",
        "💡 Tip: QR codes can store URLs, text, WiFi credentials, and more!",
      ].join("\n");

      reply(usageMessage);
      return;
    }

    // Validate: text length (QR codes have practical limits)
    const maxLength = 2000;
    if (textToEncode.length > maxLength) {
      reply(
        `⚠️ Text is too long for QR code. Maximum length is ${maxLength} characters.\n` +
          `Your text: ${textToEncode.length} characters.\n\n` +
          "💡 Tip: Try using a URL shortener for long links."
      );
      return;
    }

    // Validate: text is not empty after trimming
    if (!textToEncode.trim()) {
      reply("⚠️ Please provide text to generate a QR code.");
      return;
    }

    // Send generating indicator
    api.sendMessage("🔄 Generating QR code...", threadID, async (err, info) => {
      if (err) {
        console.error("❌ Failed to send status message:", err);
      }

      const statusMessageID = info?.messageID;

      try {
        // Generate QR code as PNG stream
        const qrStream = generateQRCode(textToEncode);

        // Prepare caption (truncate if text is too long for display)
        const displayText =
          textToEncode.length > 100
            ? `${textToEncode.substring(0, 100)}...`
            : textToEncode;

        // Prepare message with QR code attachment
        const messageWithQR = {
          body: `📱 QR Code for:\n${displayText}`,
          attachment: qrStream,
        };

        // Send the QR code image
        api.sendMessage(messageWithQR, threadID, (sendErr) => {
          if (sendErr) {
            console.error("❌ Failed to send QR code:", sendErr);
            reply("❌ Failed to send QR code. Please try again.");
          }

          // Delete the status message after sending QR code
          if (statusMessageID) {
            api.unsendMessage(statusMessageID, (unsendErr) => {
              if (unsendErr) {
                // Ignore unsend errors silently
              }
            });
          }
        }, messageID);

        // Log QR generation for debugging
        const truncatedText =
          textToEncode.length > 30
            ? `${textToEncode.substring(0, 30)}...`
            : textToEncode;
        console.log(`📱 QR: "${truncatedText}" by ${event.senderID}`);
      } catch (generateError) {
        console.error("❌ Error generating QR code:", generateError);

        // Delete status message on error
        if (statusMessageID) {
          api.unsendMessage(statusMessageID, () => {});
        }

        // Determine user-friendly error message
        let errorMessage = "❌ An error occurred while generating the QR code.";

        if (generateError.message?.includes("too long")) {
          errorMessage =
            "⚠️ The text is too long to encode in a QR code. Please use shorter text.";
        } else if (generateError.message?.includes("Invalid")) {
          errorMessage =
            "⚠️ Invalid input for QR code generation. Please try different text.";
        }

        reply(errorMessage);
      }
    });
  } catch (error) {
    console.error("❌ Error in /qr command:", error);
    reply("❌ An unexpected error occurred. Please try again.");
  }
};