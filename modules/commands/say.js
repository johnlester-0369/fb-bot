/**
 * Say Command Module
 * Converts text to speech using Google TTS API
 * @module commands/say
 */

import axios from "axios";

// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

/**
 * Supported language codes for TTS
 * @constant {Object<string, string>}
 */
const SUPPORTED_LANGUAGES = {
  af: "Afrikaans",
  sq: "Albanian",
  ar: "Arabic",
  hy: "Armenian",
  az: "Azerbaijani",
  eu: "Basque",
  be: "Belarusian",
  bn: "Bengali",
  bs: "Bosnian",
  bg: "Bulgarian",
  ca: "Catalan",
  ceb: "Cebuano",
  zh: "Chinese (Simplified)",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  nl: "Dutch",
  en: "English",
  eo: "Esperanto",
  et: "Estonian",
  fil: "Filipino",
  fi: "Finnish",
  fr: "French",
  gl: "Galician",
  ka: "Georgian",
  de: "German",
  el: "Greek",
  gu: "Gujarati",
  ht: "Haitian Creole",
  ha: "Hausa",
  he: "Hebrew",
  hi: "Hindi",
  hmn: "Hmong",
  hu: "Hungarian",
  is: "Icelandic",
  ig: "Igbo",
  id: "Indonesian",
  ga: "Irish",
  it: "Italian",
  ja: "Japanese",
  jv: "Javanese",
  kn: "Kannada",
  kk: "Kazakh",
  km: "Khmer",
  ko: "Korean",
  lo: "Lao",
  la: "Latin",
  lv: "Latvian",
  lt: "Lithuanian",
  mk: "Macedonian",
  mg: "Malagasy",
  ms: "Malay",
  ml: "Malayalam",
  mt: "Maltese",
  mi: "Maori",
  mr: "Marathi",
  mn: "Mongolian",
  my: "Myanmar (Burmese)",
  ne: "Nepali",
  no: "Norwegian",
  ny: "Nyanja (Chichewa)",
  or: "Odia (Oriya)",
  ps: "Pashto",
  fa: "Persian",
  pl: "Polish",
  pt: "Portuguese",
  pa: "Punjabi",
  ro: "Romanian",
  ru: "Russian",
  sm: "Samoan",
  gd: "Scots Gaelic",
  sr: "Serbian",
  st: "Sesotho",
  sn: "Shona",
  sd: "Sindhi",
  si: "Sinhala (Sinhalese)",
  sk: "Slovak",
  sl: "Slovenian",
  so: "Somali",
  es: "Spanish",
  su: "Sundanese",
  sw: "Swahili",
  sv: "Swedish",
  tl: "Tagalog (Filipino)",
  tg: "Tajik",
  ta: "Tamil",
  tt: "Tatar",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  tk: "Turkmen",
  uk: "Ukrainian",
  ur: "Urdu",
  ug: "Uyghur",
  uz: "Uzbek",
  vi: "Vietnamese",
  cy: "Welsh",
  xh: "Xhosa",
  yi: "Yiddish",
  yo: "Yoruba",
  zu: "Zulu",
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates if a language code is supported
 * @param {string} langCode - Language code to validate
 * @returns {boolean} True if language code is supported
 */
function isValidLanguage(langCode) {
  if (!langCode || typeof langCode !== "string") {
    return false;
  }
  return langCode.toLowerCase() in SUPPORTED_LANGUAGES;
}

/**
 * Gets the language name from language code
 * @param {string} langCode - Language code
 * @returns {string} Language name or the code in uppercase if not found
 */
function getLanguageName(langCode) {
  if (!langCode || typeof langCode !== "string") {
    return "Unknown";
  }
  return SUPPORTED_LANGUAGES[langCode.toLowerCase()] || langCode.toUpperCase();
}

/**
 * Generates text-to-speech audio stream using Google Translate TTS API
 * Returns an axios response stream with .path property for fca-unofficial compatibility
 * @param {string} text - Text to convert to speech
 * @param {string} lang - Language code for speech
 * @returns {Promise<Object>} Axios response with stream data
 * @throws {Error} If TTS generation fails
 */
async function generateTTSStream(text, lang) {
  const url = "https://translate.google.com/translate_tts";

  const response = await axios.get(url, {
    params: {
      ie: "UTF-8",
      q: text,
      tl: lang.toLowerCase(),
      client: "tw-ob",
    },
    responseType: "stream",
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://translate.google.com/",
    },
  });

  // Attach .path property to mimic file path for fca-unofficial upload
  // This is required for the Facebook API to properly identify the file type
  response.data.path = `tts_${Date.now()}_${Math.floor(Math.random() * 999)}.mp3`;

  return response.data;
}

/**
 * Parses say command arguments
 * Supports formats:
 * - /say <text> | <lang>
 * - /say | <lang> (when replying to a message)
 * - /say <text> (defaults to English)
 * @param {string[]} args - Command arguments array
 * @returns {{text: string|null, targetLang: string}} Parsed arguments
 */
function parseSayArgs(args) {
  const defaultLang = "en";

  // Join args into a single string for parsing
  const argsString = args.join(" ").trim();

  // If no args, return null text with default language
  if (!argsString) {
    return { text: null, targetLang: defaultLang };
  }

  // Check for pipe separator: "text | lang" or "| lang"
  const pipeIndex = argsString.lastIndexOf("|");

  if (pipeIndex !== -1) {
    const textPart = argsString.slice(0, pipeIndex).trim();
    const langPart = argsString.slice(pipeIndex + 1).trim();

    return {
      text: textPart || null,
      targetLang: langPart || defaultLang,
    };
  }

  // No pipe found, treat entire string as text to speak in English
  return {
    text: argsString,
    targetLang: defaultLang,
  };
}

/**
 * Builds a list of popular language codes for help message
 * @returns {string} Formatted language code list
 */
function getPopularLanguageCodes() {
  return [
    "en - English",
    "ko - Korean",
    "ja - Japanese",
    "zh - Chinese (Simplified)",
    "vi - Vietnamese",
    "th - Thai",
    "fr - French",
    "de - German",
    "es - Spanish",
    "ru - Russian",
    "ar - Arabic",
    "hi - Hindi",
    "fil - Filipino",
    "id - Indonesian",
    "pt - Portuguese",
  ].join("\n");
}

// ============================================================================
// COMMAND CONFIGURATION
// ============================================================================

/**
 * Command configuration
 * @type {Object}
 */
export const config = {
  name: "say",
  description: "Convert text to speech audio",
};

// ============================================================================
// COMMAND HANDLER
// ============================================================================

/**
 * Handles the /say command
 * Converts text to speech using Google TTS and sends as voice message
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
    // Parse arguments
    const { text: parsedText, targetLang } = parseSayArgs(args);

    // Determine the text to speak
    let textToSpeak = parsedText;

    // If no text provided, check for reply message
    if (!textToSpeak && messageReply) {
      textToSpeak = messageReply.body || null;
    }

    // Validate: text must be provided
    if (!textToSpeak) {
      const usageMessage = [
        "🔊 Text-to-Speech Command Usage:",
        "",
        `• ${prefix}say <text> | <lang> - Speak in specified language`,
        `• ${prefix}say <text> - Speak in English`,
        `• Reply to a message with "${prefix}say | <lang>" - Speak replied message`,
        `• Reply to a message with "${prefix}say" - Speak in English`,
        "",
        "Examples:",
        `• ${prefix}say Hello world | en`,
        `• ${prefix}say 안녕하세요 | ko`,
        `• ${prefix}say Bonjour | fr`,
        "",
        "Popular language codes:",
        getPopularLanguageCodes(),
      ].join("\n");

      reply(usageMessage);
      return;
    }

    // Validate: target language
    if (!isValidLanguage(targetLang)) {
      reply(
        `⚠️ Unknown language code: "${targetLang}"\n\n` +
          "Common codes: en, ko, ja, zh, vi, fr, de, es, ru, ar, hi, th, fil, id"
      );
      return;
    }

    // Validate: text length (Google TTS has limits)
    const maxLength = 200;
    if (textToSpeak.length > maxLength) {
      reply(
        `⚠️ Text is too long for speech. Maximum length is ${maxLength} characters.\n` +
          `Your text: ${textToSpeak.length} characters.\n\n` +
          "💡 Tip: Try breaking your text into smaller parts."
      );
      return;
    }

    // Validate: text is not empty after trimming
    if (!textToSpeak.trim()) {
      reply("⚠️ Please provide text to convert to speech.");
      return;
    }

    // Send generating indicator
    api.sendMessage("🔄 Generating audio...", threadID, async (err, info) => {
      if (err) {
        console.error("❌ Failed to send status message:", err);
      }

      const statusMessageID = info?.messageID;

      try {
        // Generate TTS audio stream
        const audioStream = await generateTTSStream(textToSpeak, targetLang);

        // Get language name for caption
        const langName = getLanguageName(targetLang);

        // Prepare display text (truncate if too long)
        const displayText =
          textToSpeak.length > 80
            ? `${textToSpeak.substring(0, 80)}...`
            : textToSpeak;

        // Prepare message with audio attachment
        const messageWithAudio = {
          body: `🔊 "${displayText}"\n\n「 ${langName} 」`,
          attachment: audioStream,
        };

        // Send the audio message
        api.sendMessage(messageWithAudio, threadID, (sendErr) => {
          if (sendErr) {
            console.error("❌ Failed to send audio message:", sendErr);
            reply("❌ Failed to send audio. Please try again.");
          }

          // Delete the status message after sending audio
          if (statusMessageID) {
            api.unsendMessage(statusMessageID, (unsendErr) => {
              if (unsendErr) {
                // Ignore unsend errors silently
              }
            });
          }
        }, messageID);

        // Log TTS generation for debugging
        const truncatedText =
          textToSpeak.length > 30
            ? `${textToSpeak.substring(0, 30)}...`
            : textToSpeak;
        console.log(
          `🔊 TTS: "${truncatedText}" (${targetLang}) by ${event.senderID}`
        );
      } catch (generateError) {
        console.error("❌ Error generating TTS:", generateError);

        // Delete status message on error
        if (statusMessageID) {
          api.unsendMessage(statusMessageID, () => {});
        }

        // Determine user-friendly error message
        let errorMessage = "❌ An error occurred while generating speech.";

        if (
          generateError.code === "ECONNABORTED" ||
          generateError.code === "ETIMEDOUT"
        ) {
          errorMessage = "⚠️ TTS request timed out. Please try again later.";
        } else if (
          generateError.code === "ENOTFOUND" ||
          generateError.code === "EAI_AGAIN"
        ) {
          errorMessage =
            "⚠️ Could not connect to TTS service. Check your internet connection.";
        } else if (generateError.response?.status === 429) {
          errorMessage =
            "⚠️ Too many TTS requests. Please wait a moment and try again.";
        } else if (generateError.response?.status === 403) {
          errorMessage =
            "⚠️ TTS service access denied. Please try again later.";
        } else if (generateError.response?.status >= 500) {
          errorMessage =
            "⚠️ TTS service is temporarily unavailable. Please try again later.";
        }

        reply(errorMessage);
      }
    });
  } catch (error) {
    console.error("❌ Error in /say command:", error);
    reply("❌ An unexpected error occurred. Please try again.");
  }
};