/**
 * Translation Command Module
 * Translates text using Google Translate API
 * @module commands/trans
 */

import axios from "axios";

// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

/**
 * Supported language codes for translation
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
 * Translates text using Google Translate API (free endpoint)
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string} [sourceLang='auto'] - Source language code or 'auto'
 * @returns {Promise<{translatedText: string, detectedLang: string}>} Translation result
 * @throws {Error} If translation fails
 */
async function translateText(text, targetLang, sourceLang = "auto") {
  const url = "https://translate.googleapis.com/translate_a/single";

  const response = await axios.get(url, {
    params: {
      client: "gtx",
      sl: sourceLang,
      tl: targetLang.toLowerCase(),
      dt: "t",
      q: text,
    },
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const data = response.data;

  if (!data || !Array.isArray(data) || !data[0]) {
    throw new Error("Invalid response from translation service");
  }

  // Extract translated text from response segments
  let translatedText = "";
  for (const segment of data[0]) {
    if (segment && segment[0]) {
      translatedText += segment[0];
    }
  }

  // Get detected source language
  const detectedLang = data[2] || sourceLang;

  return {
    translatedText,
    detectedLang,
  };
}

/**
 * Parses translation command arguments
 * Supports formats:
 * - /trans <text> | <lang>
 * - /trans | <lang> (when replying to a message)
 * - /trans <text> (defaults to English)
 * @param {string[]} args - Command arguments array
 * @returns {{text: string|null, targetLang: string}} Parsed arguments
 */
function parseTransArgs(args) {
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

  // No pipe found, treat entire string as text to translate to English
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
  name: "trans",
  description: "Translate text to another language",
};

// ============================================================================
// COMMAND HANDLER
// ============================================================================

/**
 * Handles the /trans command
 * Translates text using Google Translate
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
    const { text: parsedText, targetLang } = parseTransArgs(args);

    // Determine the text to translate
    let textToTranslate = parsedText;

    // If no text provided, check for reply message
    if (!textToTranslate && messageReply) {
      textToTranslate = messageReply.body || null;
    }

    // Validate: text must be provided
    if (!textToTranslate) {
      const usageMessage = [
        "🌐 Translation Command Usage:",
        "",
        `• ${prefix}trans <text> | <lang> - Translate to specified language`,
        `• ${prefix}trans <text> - Translate to English`,
        `• Reply to a message with "${prefix}trans | <lang>" - Translate replied message`,
        `• Reply to a message with "${prefix}trans" - Translate to English`,
        "",
        "Examples:",
        `• ${prefix}trans Hello world | ko`,
        `• ${prefix}trans Bonjour | ja`,
        `• ${prefix}trans こんにちは`,
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

    // Validate: text length (Google Translate has limits)
    const maxLength = 5000;
    if (textToTranslate.length > maxLength) {
      reply(
        `⚠️ Text is too long. Maximum length is ${maxLength} characters.\n` +
          `Your text: ${textToTranslate.length} characters.`
      );
      return;
    }

    // Validate: text is not empty after trimming
    if (!textToTranslate.trim()) {
      reply("⚠️ Please provide text to translate.");
      return;
    }

    // Perform translation
    const { translatedText, detectedLang } = await translateText(
      textToTranslate,
      targetLang
    );

    // Validate translation result
    if (!translatedText || !translatedText.trim()) {
      reply("⚠️ Translation returned empty result. Please try again.");
      return;
    }

    // Get language names for display
    const sourceLangName = getLanguageName(detectedLang);
    const targetLangName = getLanguageName(targetLang);

    // Format response message
    const responseMessage = [
      "🌐 Translation",
      "",
      `📝 ${translatedText}`,
      "",
      `「 ${sourceLangName} → ${targetLangName} 」`,
    ].join("\n");

    reply(responseMessage);

    // Log translation for debugging
    const truncatedText =
      textToTranslate.length > 30
        ? `${textToTranslate.substring(0, 30)}...`
        : textToTranslate;
    console.log(
      `🌐 Translation: "${truncatedText}" (${detectedLang} -> ${targetLang}) by ${event.senderID}`
    );
  } catch (error) {
    console.error("❌ Error in /trans command:", error);

    // Determine user-friendly error message based on error type
    let errorMessage = "❌ An error occurred while translating.";

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      errorMessage =
        "⚠️ Translation request timed out. Please try again later.";
    } else if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
      errorMessage =
        "⚠️ Could not connect to translation service. Check your internet connection.";
    } else if (error.response?.status === 429) {
      errorMessage =
        "⚠️ Too many translation requests. Please wait a moment and try again.";
    } else if (error.response?.status >= 500) {
      errorMessage =
        "⚠️ Translation service is temporarily unavailable. Please try again later.";
    } else if (error.message?.includes("Invalid response")) {
      errorMessage =
        "⚠️ Could not parse translation response. Please try again.";
    }

    reply(errorMessage);
  }
};