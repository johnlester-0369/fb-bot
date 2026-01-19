"use strict";
const fs = require("fs");
const path = require("path");
const logger = require("../func/logger");
const { get, post, jar, makeDefaults } = require("../src/utils/request");
const { saveCookies, getAppState } = require("../src/utils/client");
const { getFrom } = require("../src/utils/constants");
const { loadConfig } = require("./config");
const { config } = loadConfig();
const { v4: uuidv4 } = require("uuid");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const axiosBase = require("axios");
const qs = require("querystring");
const crypto = require("crypto");
const { TOTP } = require("totp-generator");

const regions = [
  { code: "PRN", name: "Pacific Northwest Region", location: "Pacific Northwest" },
  { code: "VLL", name: "Valley Region", location: "Valley" },
  { code: "ASH", name: "Ashburn Region", location: "Ashburn" },
  { code: "DFW", name: "Dallas/Fort Worth Region", location: "Dallas/Fort Worth" },
  { code: "LLA", name: "Los Angeles Region", location: "Los Angeles" },
  { code: "FRA", name: "Frankfurt", location: "Frankfurt" },
  { code: "SIN", name: "Singapore", location: "Singapore" },
  { code: "NRT", name: "Tokyo", location: "Japan" },
  { code: "HKG", name: "Hong Kong", location: "Hong Kong" },
  { code: "SYD", name: "Sydney", location: "Sydney" },
  { code: "PNB", name: "Pacific Northwest - Beta", location: "Pacific Northwest " }
];

const REGION_MAP = new Map(regions.map(r => [r.code, r]));

/**
 * Parse region from HTML response
 * @param {string} html - HTML content
 * @returns {string} Region code
 */
function parseRegion(html) {
  try {
    const m1 = html.match(/"endpoint":"([^"]+)"/);
    const m2 = m1 ? null : html.match(/endpoint\\":\\"([^\\"]+)\\"/);
    const raw = (m1 && m1[1]) || (m2 && m2[1]);
    if (!raw) return "PRN";
    const endpoint = raw.replace(/\\\//g, "/");
    const url = new URL(endpoint);
    const rp = url.searchParams ? url.searchParams.get("region") : null;
    return rp ? rp.toUpperCase() : "PRN";
  } catch {
    return "PRN";
  }
}

/**
 * Mask a string for privacy
 * @param {string} s - String to mask
 * @param {number} keep - Characters to keep visible
 * @returns {string} Masked string
 */
function mask(s, keep = 3) {
  if (!s) return "";
  const n = s.length;
  return n <= keep ? "*".repeat(n) : s.slice(0, keep) + "*".repeat(Math.max(0, n - keep));
}

/**
 * Generate MD5 hash
 * @param {string} s - String to hash
 * @returns {string} MD5 hash
 */
function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

/**
 * Generate random string
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
function randomString(length = 24) {
  let s = "abcdefghijklmnopqrstuvwxyz";
  let out = s.charAt(Math.floor(Math.random() * s.length));
  for (let i = 1; i < length; i++) out += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(36 * Math.random()));
  return out;
}

/**
 * Sort object keys alphabetically
 * @param {Object} o - Object to sort
 * @returns {Object} Sorted object
 */
function sortObject(o) {
  const keys = Object.keys(o).sort();
  const x = {};
  for (const k of keys) x[k] = o[k];
  return x;
}

/**
 * Encode signature for Facebook API
 * @param {Object} obj - Object to encode
 * @returns {string} Encoded signature
 */
function encodeSig(obj) {
  let data = "";
  for (const k of Object.keys(obj)) data += `${k}=${obj[k]}`;
  return md5(data + "62f8ce9f74b12f84c123cc23437a4a32");
}

/**
 * Generate random integer in range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Choose random element from array
 * @param {Array} arr - Array to choose from
 * @returns {*} Random element
 */
function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate random Android build ID
 * @returns {string} Build ID
 */
function randomBuildId() {
  const prefixes = ["QP1A", "RP1A", "SP1A", "TP1A", "UP1A", "AP4A"];
  return `${choice(prefixes)}.${rand(180000, 250000)}.${rand(10, 99)}`;
}

/**
 * Generate random screen resolution
 * @returns {{ w: number, h: number, d: number }} Resolution object
 */
function randomResolution() {
  const presets = [{ w: 720, h: 1280, d: 2.0 }, { w: 1080, h: 1920, d: 2.625 }, { w: 1080, h: 2400, d: 3.0 }, { w: 1440, h: 3040, d: 3.5 }, { w: 1440, h: 3200, d: 4.0 }];
  return choice(presets);
}

/**
 * Generate random Facebook app version
 * @returns {string} App version
 */
function randomFbav() {
  return `${rand(390, 499)}.${rand(0, 3)}.${rand(0, 2)}.${rand(10, 60)}.${rand(100, 999)}`;
}

/**
 * Generate random Orca (Messenger) user agent
 * @returns {string} User agent string
 */
function randomOrcaUA() {
  const androidVersions = ["8.1.0", "9", "10", "11", "12", "13", "14"];
  const devices = [{ brand: "samsung", model: "SM-G996B" }, { brand: "samsung", model: "SM-S908E" }, { brand: "Xiaomi", model: "M2101K9AG" }, { brand: "OPPO", model: "CPH2219" }, { brand: "vivo", model: "V2109" }, { brand: "HUAWEI", model: "VOG-L29" }, { brand: "asus", model: "ASUS_I001DA" }, { brand: "Google", model: "Pixel 6" }, { brand: "realme", model: "RMX2170" }];
  const carriers = ["Viettel Telecom", "Mobifone", "Vinaphone", "T-Mobile", "Verizon", "AT&T", "Telkomsel", "Jio", "NTT DOCOMO", "Vodafone", "Orange"];
  const locales = ["vi_VN", "en_US", "en_GB", "id_ID", "th_TH", "fr_FR", "de_DE", "es_ES", "pt_BR"];
  const archs = ["arm64-v8a", "armeabi-v7a"];
  const a = choice(androidVersions);
  const d = choice(devices);
  const b = randomBuildId();
  const r = randomResolution();
  const fbav = randomFbav();
  const fbbv = rand(320000000, 520000000);
  const arch = `${choice(archs)}:${choice(archs)}`;
  const ua = `Dalvik/2.1.0 (Linux; U; Android ${a}; ${d.model} Build/${b}) [FBAN/Orca-Android;FBAV/${fbav};FBPN/com.facebook.orca;FBLC/${choice(locales)};FBBV/${fbbv};FBCR/${choice(carriers)};FBMF/${d.brand};FBBD/${d.brand};FBDV/${d.model};FBSV/${a};FBCA/${arch};FBDM/{density=${r.d.toFixed(1)},width=${r.w},height=${r.h}};FB_FW/1;]`;
  return ua;
}

const MOBILE_UA = randomOrcaUA();

/**
 * Build HTTP headers for Facebook requests
 * @param {string} url - Target URL
 * @param {Object} extra - Extra headers
 * @returns {Object} Headers object
 */
function buildHeaders(url, extra = {}) {
  const u = new URL(url);
  return { "content-type": "application/x-www-form-urlencoded", "x-fb-http-engine": "Liger", "user-agent": MOBILE_UA, Host: u.host, Origin: "https://www.facebook.com", Referer: "https://www.facebook.com/", Connection: "keep-alive", ...extra };
}

/**
 * Generate TOTP code from secret
 * @param {string} secret - TOTP secret
 * @returns {Promise<string>} TOTP code
 */
const genTotp = async secret => {
  const cleaned = String(secret || "").replace(/\s+/g, "").toUpperCase();
  const r = await TOTP.generate(cleaned);
  return typeof r === "object" ? r.otp : r;
};

/**
 * Normalize cookie header string to array of key=value pairs
 * @param {string} s - Cookie string
 * @returns {string[]} Array of cookie pairs
 */
function normalizeCookieHeaderString(s) {
  let str = String(s || "").trim();
  if (!str) return [];
  if (/^cookie\s*:/i.test(str)) str = str.replace(/^cookie\s*:/i, "").trim();
  str = str.replace(/\r?\n/g, " ").replace(/\s*;\s*/g, ";");
  const parts = str.split(";").map(v => v.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!k) continue;
    out.push(`${k}=${v}`);
  }
  return out;
}

/**
 * Set cookies in jar from key=value pairs
 * @param {Object} j - Cookie jar
 * @param {string[]} pairs - Cookie pairs
 * @param {string} domain - Cookie domain
 */
function setJarFromPairs(j, pairs, domain) {
  const expires = new Date(Date.now() + 31536e6).toUTCString();
  for (const kv of pairs) {
    const cookieStr = `${kv}; expires=${expires}; domain=${domain}; path=/;`;
    try {
      if (typeof j.setCookieSync === "function") j.setCookieSync(cookieStr, "https://www.facebook.com");
      else j.setCookie(cookieStr, "https://www.facebook.com");
    } catch { }
  }
}

/**
 * Get cookie header string from jar
 * @param {Object} j - Cookie jar
 * @returns {string} Cookie header string
 */
function cookieHeaderFromJar(j) {
  const urls = ["https://www.facebook.com", "https://www.messenger.com"];
  const seen = new Set();
  const parts = [];
  for (const u of urls) {
    let s = "";
    try {
      s = typeof j.getCookieStringSync === "function" ? j.getCookieStringSync(u) : "";
    } catch { }
    if (!s) continue;
    for (const kv of s.split(";")) {
      const t = kv.trim();
      const name = t.split("=")[0];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      parts.push(t);
    }
  }
  return parts.join("; ");
}

/**
 * Save appstate to file (no database)
 * @param {Object} j - Cookie jar
 * @param {string} userID - User ID
 */
async function backupAppStateFile(j, userID) {
  try {
    const appJson = getAppState(j);
    const out = path.join(process.cwd(), "appstate.json");
    fs.writeFileSync(out, JSON.stringify(appJson, null, 2));
    logger.info("AppState backup saved to file");
  } catch (e) {
    logger.warn(`Failed to save appstate backup:`, e);
  }
}

/**
 * Load appstate from file
 * @returns {Array|null} - Parsed appstate or null
 */
function loadAppStateFromFile() {
  try {
    const filePath = path.join(process.cwd(), "appstate.json");
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    }
  } catch (e) {
    logger.warn(`Failed to load appstate from file:`, e);
  }
  return null;
}

const MESSENGER_USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 9; ASUS_Z01QD Build/PQ3A.190605.003) [FBAN/Orca-Android;FBAV/391.2.0.20.404;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/437533963;FBCR/Viettel Telecom;FBMF/asus;FBBD/asus;FBDV/ASUS_Z01QD;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=1.5,width=1600,height=900};FB_FW/1;]";

/**
 * Encode signature for authentication
 * @param {Object} obj - Object to encode
 * @returns {string} Encoded signature
 */
function encodesig(obj) {
  let data = "";
  Object.keys(obj).forEach(k => { data += `${k}=${obj[k]}`; });
  return md5(data + "62f8ce9f74b12f84c123cc23437a4a32");
}

/**
 * Sort object keys
 * @param {Object} obj - Object to sort
 * @returns {Object} Sorted object
 */
function sort(obj) {
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

/**
 * Set cookies in jar from appstate array
 * @param {Object} j - Cookie jar
 * @param {Array} appstate - Appstate array
 */
async function setJarCookies(j, appstate) {
  const tasks = [];
  for (const c of appstate) {
    const cookieName = c.name || c.key;
    const cookieValue = c.value;
    if (!cookieName || cookieValue === undefined) continue;

    const cookieDomain = c.domain || ".facebook.com";
    const cookiePath = c.path || "/";
    const dom = cookieDomain.replace(/^\./, "");

    let expiresStr = "";
    if (c.expirationDate !== undefined) {
      let expiresDate;
      if (typeof c.expirationDate === "number") {
        const now = Date.now();
        const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
        if (c.expirationDate < (now + oneYearInMs) / 1000) {
          expiresDate = new Date(c.expirationDate * 1000);
        } else {
          expiresDate = new Date(c.expirationDate);
        }
      } else {
        expiresDate = new Date(c.expirationDate);
      }
      expiresStr = `; expires=${expiresDate.toUTCString()}`;
    } else if (c.expires) {
      const expiresDate = typeof c.expires === "number" ? new Date(c.expires) : new Date(c.expires);
      expiresStr = `; expires=${expiresDate.toUTCString()}`;
    }

    const buildCookieString = (domainOverride = null) => {
      const domain = domainOverride || cookieDomain;
      let cookieParts = [`${cookieName}=${cookieValue}${expiresStr}`];
      cookieParts.push(`Domain=${domain}`);
      cookieParts.push(`Path=${cookiePath}`);
      if (c.secure === true) {
        cookieParts.push("Secure");
      }
      if (c.httpOnly === true) {
        cookieParts.push("HttpOnly");
      }
      if (c.sameSite) {
        const sameSiteValue = String(c.sameSite).toLowerCase();
        if (["strict", "lax", "none"].includes(sameSiteValue)) {
          cookieParts.push(`SameSite=${sameSiteValue.charAt(0).toUpperCase() + sameSiteValue.slice(1)}`);
        }
      }
      return cookieParts.join("; ");
    };

    const cookieConfigs = [];

    if (cookieDomain === ".facebook.com" || cookieDomain === "facebook.com") {
      cookieConfigs.push({ url: `http://${dom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `https://${dom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `http://www.${dom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `https://www.${dom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `http://messenger.com${cookiePath}`, cookieStr: buildCookieString(".messenger.com") });
      cookieConfigs.push({ url: `https://messenger.com${cookiePath}`, cookieStr: buildCookieString(".messenger.com") });
      cookieConfigs.push({ url: `http://www.messenger.com${cookiePath}`, cookieStr: buildCookieString(".messenger.com") });
      cookieConfigs.push({ url: `https://www.messenger.com${cookiePath}`, cookieStr: buildCookieString(".messenger.com") });
    } else if (cookieDomain === ".messenger.com" || cookieDomain === "messenger.com") {
      const messengerDom = cookieDomain.replace(/^\./, "");
      cookieConfigs.push({ url: `http://${messengerDom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `https://${messengerDom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `http://www.${messengerDom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `https://www.${messengerDom}${cookiePath}`, cookieStr: buildCookieString() });
    } else {
      cookieConfigs.push({ url: `http://${dom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `https://${dom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `http://www.${dom}${cookiePath}`, cookieStr: buildCookieString() });
      cookieConfigs.push({ url: `https://www.${dom}${cookiePath}`, cookieStr: buildCookieString() });
    }

    for (const config of cookieConfigs) {
      tasks.push(j.setCookie(config.cookieStr, config.url).catch((err) => {
        if (err && err.message && err.message.includes("Cookie not in this host's domain")) {
          return;
        }
        return;
      }));
    }
  }
  await Promise.all(tasks);
}

/**
 * Login via Facebook Graph API
 * @param {string} username - Email/username
 * @param {string} password - Password
 * @param {string} twofactorSecretOrCode - 2FA secret or code
 * @param {string} i_user - User ID override
 * @param {Object} externalJar - External cookie jar
 * @returns {Promise<Object>} Login result
 */
async function loginViaGraph(username, password, twofactorSecretOrCode, i_user, externalJar) {
  const cookieJar = externalJar instanceof CookieJar ? externalJar : new CookieJar();
  const client = wrapper(axiosBase.create({ jar: cookieJar, withCredentials: true, timeout: 30000, validateStatus: () => true }));
  const device_id = uuidv4();
  const family_device_id = device_id;
  const machine_id = randomString(24);
  const base = {
    adid: "00000000-0000-0000-0000-000000000000",
    format: "json",
    device_id,
    email: username,
    password,
    generate_analytics_claim: "1",
    community_id: "",
    cpl: "true",
    try_num: "1",
    family_device_id,
    secure_family_device_id: "",
    credentials_type: "password",
    enroll_misauth: "false",
    generate_session_cookies: "1",
    source: "login",
    generate_machine_id: "1",
    jazoest: "22297",
    meta_inf_fbmeta: "NO_FILE",
    advertiser_id: "00000000-0000-0000-0000-000000000000",
    currently_logged_in_userid: "0",
    locale: "vi_VN",
    client_country_code: "VN",
    fb_api_req_friendly_name: "authenticate",
    fb_api_caller_class: "AuthOperations$PasswordAuthOperation",
    api_key: "256002347743983",
    access_token: "256002347743983|374e60f8b9bb6b8cbb30f78030438895"
  };
  const headers = {
    "User-Agent": MESSENGER_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-fb-connection-quality": "EXCELLENT",
    "x-fb-sim-hni": "45204",
    "x-fb-net-hni": "45204",
    "x-fb-connection-type": "WIFI",
    "x-tigon-is-retry": "False",
    "x-fb-friendly-name": "authenticate",
    "x-fb-request-analytics-tags": '{"network_tags":{"retry_attempt":"0"},"application_tags":"unknown"}',
    "x-fb-http-engine": "Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    authorization: `OAuth ${base.access_token}`
  };
  const form1 = { ...base };
  form1.sig = encodesig(sort(form1));
  const res1 = await client.request({ url: "https://b-graph.facebook.com/auth/login", method: "post", data: qs.stringify(form1), headers });
  if (res1.status === 200 && res1.data && res1.data.session_cookies) {
    const appstate = res1.data.session_cookies.map(c => ({ key: c.name, value: c.value, domain: c.domain, path: c.path }));
    const cUserCookie = appstate.find(c => c.key === "c_user");
    if (i_user) appstate.push({ key: "i_user", value: i_user, domain: ".facebook.com", path: "/" });
    else if (cUserCookie) appstate.push({ key: "i_user", value: cUserCookie.value, domain: ".facebook.com", path: "/" });
    await setJarCookies(cookieJar, appstate);
    let eaau = null;
    let eaad6v7 = null;
    try {
      const r1 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res1.data.access_token}&new_app_id=350685531728`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res1.data.access_token}` } });
      eaau = r1.data && r1.data.access_token ? r1.data.access_token : null;
    } catch { }
    try {
      const r2 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res1.data.access_token}&new_app_id=275254692598279`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res1.data.access_token}` } });
      eaad6v7 = r2.data && r2.data.access_token ? r2.data.access_token : null;
    } catch { }
    return { ok: true, cookies: appstate.map(c => ({ key: c.key, value: c.value })), jar: cookieJar, access_token_mess: res1.data.access_token || null, access_token: eaau, access_token_eaad6v7: eaad6v7, uid: res1.data.uid || cUserCookie?.value || null, session_key: res1.data.session_key || null };
  }
  const err = res1 && res1.data && res1.data.error ? res1.data.error : {};
  if (err && err.code === 406) {
    const data = err.error_data || {};
    let code = null;
    if (twofactorSecretOrCode && /^\d{6}$/.test(String(twofactorSecretOrCode))) code = String(twofactorSecretOrCode);
    else if (twofactorSecretOrCode) {
      try {
        const clean = decodeURI(twofactorSecretOrCode).replace(/\s+/g, "").toUpperCase();
        const { otp } = await TOTP.generate(clean);
        code = otp;
      } catch { }
    } else if (config.credentials?.twofactor) {
      const { otp } = await TOTP.generate(String(config.credentials.twofactor).replace(/\s+/g, "").toUpperCase());
      code = otp;
    }
    if (!code) return { ok: false, message: "2FA required" };
    const form2 = {
      ...base,
      credentials_type: "two_factor",
      twofactor_code: code,
      userid: data.uid || username,
      first_factor: data.login_first_factor || "",
      machine_id: data.machine_id || machine_id
    };
    form2.sig = encodesig(sort(form2));
    const res2 = await client.request({ url: "https://b-graph.facebook.com/auth/login", method: "post", data: qs.stringify(form2), headers });
    if (res2.status === 200 && res2.data && res2.data.session_cookies) {
      const appstate = res2.data.session_cookies.map(c => ({ key: c.name, value: c.value, domain: c.domain, path: c.path }));
      const cUserCookie = appstate.find(c => c.key === "c_user");
      if (i_user) appstate.push({ key: "i_user", value: i_user, domain: ".facebook.com", path: "/" });
      else if (cUserCookie) appstate.push({ key: "i_user", value: cUserCookie.value, domain: ".facebook.com", path: "/" });
      await setJarCookies(cookieJar, appstate);
      let eaau = null;
      let eaad6v7 = null;
      try {
        const r1 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res2.data.access_token}&new_app_id=350685531728`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res2.data.access_token}` } });
        eaau = r1.data && r1.data.access_token ? r1.data.access_token : null;
      } catch { }
      try {
        const r2 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res2.data.access_token}&new_app_id=275254692598279`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res2.data.access_token}` } });
        eaad6v7 = r2.data && r2.data.access_token ? r2.data.access_token : null;
      } catch { }
      return { ok: true, cookies: appstate.map(c => ({ key: c.key, value: c.value })), jar: cookieJar, access_token_mess: res2.data.access_token || null, access_token: eaau, access_token_eaad6v7: eaad6v7, uid: res2.data.uid || cUserCookie?.value || null, session_key: res2.data.session_key || null };
    }
    return { ok: false, message: "2FA failed" };
  }
  return { ok: false, message: "Login failed" };
}

/**
 * Get authentication tokens
 * @param {string} username - Email/username
 * @param {string} password - Password
 * @param {string} twofactor - 2FA secret
 * @returns {Promise<Object>} Token result
 */
async function tokens(username, password, twofactor = null) {
  const t0 = process.hrtime.bigint();
  if (!username || !password) return { status: false, message: "Please provide email and password" };
  logger.info(`AUTO-LOGIN: Initialize login ${mask(username, 2)}`);
  const res = await loginViaGraph(username, password, twofactor, null, jar);
  if (res && res.ok && Array.isArray(res.cookies)) {
    logger.info(`AUTO-LOGIN: Login success ${res.cookies.length} cookies`);
    const t1 = Number(process.hrtime.bigint() - t0) / 1e6;
    logger.info(`Done success login ${Math.round(t1)}ms`);
    return { status: true, cookies: res.cookies };
  }
  if (res && res.message === "2FA required") {
    logger.warn("AUTO-LOGIN: 2FA required but secret missing");
    return { status: false, message: "Please provide the 2FA secret!" };
  }
  return { status: false, message: res && res.message ? res.message : "Login failed" };
}

/**
 * Try to hydrate jar from file-based appstate backup
 * @returns {Promise<boolean>} - Whether hydration succeeded
 */
async function hydrateJarFromFile() {
  try {
    const appstate = loadAppStateFromFile();
    if (appstate && Array.isArray(appstate) && appstate.length > 0) {
      const pairs = appstate.map(c => `${c.name || c.key}=${c.value}`);
      setJarFromPairs(jar, pairs, ".facebook.com");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Try auto login if needed
 * @param {string} currentHtml - Current HTML response
 * @param {Array} currentCookies - Current cookies
 * @param {Object} globalOptions - Global options
 * @param {Object} ctxRef - Context reference
 * @param {boolean} hadAppStateInput - Whether appstate was provided
 * @returns {Promise<Object>} Login result
 */
async function tryAutoLoginIfNeeded(currentHtml, currentCookies, globalOptions, ctxRef, hadAppStateInput = false) {
  const getUID = cs =>
    cs.find(c => c.key === "i_user")?.value ||
    cs.find(c => c.key === "c_user")?.value ||
    cs.find(c => c.name === "i_user")?.value ||
    cs.find(c => c.name === "c_user")?.value;
  const htmlUID = body => {
    const s = typeof body === "string" ? body : String(body ?? "");
    return s.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s.match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
  };
  let userID = getUID(currentCookies);
  if (!userID) {
    userID = htmlUID(currentHtml);
  }
  if (userID) return { html: currentHtml, cookies: currentCookies, userID };
  
  if (hadAppStateInput) {
    const isCheckpoint = currentHtml.includes("/checkpoint/block/?next");
    if (!isCheckpoint) {
      try {
        const refreshedCookies = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
        userID = getUID(refreshedCookies);
        if (userID) {
          return { html: currentHtml, cookies: refreshedCookies, userID };
        }
      } catch { }
      throw new Error("Missing user cookie from provided appState");
    }
  }
  
  // Try to hydrate from file backup
  const hydrated = await hydrateJarFromFile();
  if (hydrated) {
    logger.info("AppState backup from file — proceeding to login");
    const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
    const resB = (await ctxRef.bypassAutomation(initial, jar)) || initial;
    const htmlB = resB && resB.data ? resB.data : "";
    if (htmlB.includes("/checkpoint/block/?next")) throw new Error("Checkpoint");
    const cookiesB = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
    const uidB = getUID(cookiesB);
    if (uidB) return { html: htmlB, cookies: cookiesB, userID: uidB };
  }
  
  if (config.autoLogin !== true) throw new Error("AppState backup unavailable — Auto-login is disabled");
  logger.warn("AppState backup unavailable — proceeding to email/password login");
  const u = config.credentials?.email;
  const p = config.credentials?.password;
  const tf = config.credentials?.twofactor || null;
  if (!u || !p) throw new Error("Missing user cookie");
  const r = await tokens(u, p, tf);
  if (!(r && r.status && Array.isArray(r.cookies))) throw new Error(r && r.message ? r.message : "Login failed");
  const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
  setJarFromPairs(jar, pairs, ".facebook.com");
  const initial2 = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
  const res2 = (await ctxRef.bypassAutomation(initial2, jar)) || initial2;
  const html2 = res2 && res2.data ? res2.data : "";
  if (html2.includes("/checkpoint/block/?next")) throw new Error("Checkpoint");
  const cookies2 = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
  const uid2 = getUID(cookies2);
  if (!uid2) throw new Error("Login failed");
  return { html: html2, cookies: cookies2, userID: uid2 };
}

/**
 * Make login function
 * @param {Object} j - Cookie jar
 * @param {string} email - Email
 * @param {string} password - Password
 * @param {Object} globalOptions - Global options
 * @returns {Function} Login function
 */
function makeLogin(j, email, password, globalOptions) {
  return async function () {
    const u = email || config.credentials?.email;
    const p = password || config.credentials?.password;
    const tf = config.credentials?.twofactor || null;
    if (!u || !p) return;
    const r = await tokens(u, p, tf);
    if (r && r.status && Array.isArray(r.cookies)) {
      const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
      setJarFromPairs(j, pairs, ".facebook.com");
      await get("https://www.facebook.com/", j, null, globalOptions).then(saveCookies(j));
    } else {
      throw new Error(r && r.message ? r.message : "Login failed");
    }
  };
}

/**
 * Main login helper function
 * @param {Array|string} appState - App state
 * @param {string|Array|Object} Cookie - Cookies
 * @param {string} email - Email
 * @param {string} password - Password
 * @param {Object} globalOptions - Global options
 * @param {Function} callback - Callback function
 */
function loginHelper(appState, Cookie, email, password, globalOptions, callback) {
  try {
    const domain = ".facebook.com";
    const extractUIDFromAppState = (appStateInput) => {
      if (!appStateInput) return null;
      let parsed = appStateInput;
      if (typeof appStateInput === "string") {
        try {
          parsed = JSON.parse(appStateInput);
        } catch {
          return null;
        }
      }
      if (Array.isArray(parsed)) {
        const cUser = parsed.find(c => (c.key === "c_user" || c.name === "c_user"));
        if (cUser) return cUser.value;
        const iUser = parsed.find(c => (c.key === "i_user" || c.name === "i_user"));
        if (iUser) return iUser.value;
      }
      return null;
    };
    let userIDFromAppState = extractUIDFromAppState(appState);
    (async () => {
      try {
        if (appState) {
          if (Array.isArray(appState) && appState.some(c => c.name)) {
            appState = appState.map(c => {
              if (c.name && !c.key) {
                c.key = c.name;
                delete c.name;
              }
              return c;
            });
          } else if (typeof appState === "string") {
            let parsed = appState;
            try {
              parsed = JSON.parse(appState);
            } catch { }

            if (Array.isArray(parsed)) {
              appState = parsed;
            } else {
              const arrayAppState = [];
              appState.split(';').forEach(c => {
                const [key, value] = c.split('=');
                if (key && value) {
                  arrayAppState.push({
                    key: key.trim(),
                    value: value.trim(),
                    domain: ".facebook.com",
                    path: "/",
                    expires: new Date().getTime() + 1000 * 60 * 60 * 24 * 365
                  });
                }
              });
              appState = arrayAppState;
            }
          }

          if (Array.isArray(appState)) {
            await setJarCookies(jar, appState);
          } else {
            throw new Error("Invalid appState format");
          }
        }
        if (Cookie) {
          let cookiePairs = [];
          if (typeof Cookie === "string") cookiePairs = normalizeCookieHeaderString(Cookie);
          else if (Array.isArray(Cookie)) cookiePairs = Cookie.map(String).filter(Boolean);
          else if (Cookie && typeof Cookie === "object") cookiePairs = Object.entries(Cookie).map(([k, v]) => `${k}=${v}`);
          if (cookiePairs.length) setJarFromPairs(jar, cookiePairs, domain);
        }
      } catch (e) {
        return callback(e);
      }
      const ctx = { globalOptions, options: globalOptions, reconnectAttempts: 0 };
      ctx.bypassAutomation = async function (resp, j) {
        global.fca = global.fca || {};
        global.fca.BypassAutomationNotification = this.bypassAutomation.bind(this);
        const s = x => (typeof x === "string" ? x : String(x ?? ""));
        const u = r => r?.request?.res?.responseUrl || (r?.config?.baseURL ? new URL(r.config.url || "/", r.config.baseURL).toString() : r?.config?.url || "");
        const isCp = r => typeof u(r) === "string" && u(r).includes("checkpoint/601051028565049");
        const cookieUID = async () => {
          try {
            const cookies = typeof j?.getCookies === "function" ? await j.getCookies("https://www.facebook.com") : [];
            return cookies.find(c => c.key === "i_user")?.value || cookies.find(c => c.key === "c_user")?.value;
          } catch { return undefined; }
        };
        const htmlUID = body => s(body).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s(body).match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
        const getUID = async body => (await cookieUID()) || htmlUID(body);
        const refreshJar = async () => get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
        const bypass = async body => {
          const b = s(body);
          const UID = await getUID(b);
          const fb_dtsg = getFrom(b, '"DTSGInitData",[],{"token":"', '",') || b.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
          const jazoest = getFrom(b, 'name="jazoest" value="', '"') || getFrom(b, "jazoest=", '",') || b.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
          const lsd = getFrom(b, '["LSD",[],{"token":"', '"}') || b.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
          const form = { av: UID, fb_dtsg, jazoest, lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: "FBScrapingWarningMutation", variables: "{}", server_timestamps: true, doc_id: 6339492849481770 };
          await post("https://www.facebook.com/api/graphql/", j, form, null, this.options).then(saveCookies(j));
          logger.warn("Facebook automation warning detected, handling...");
          this.reconnectAttempts = 0;
        };
        try {
          if (resp) {
            if (isCp(resp)) {
              await bypass(s(resp.data));
              const refreshed = await refreshJar();
              if (isCp(refreshed)) logger.warn("Checkpoint still present after refresh");
              else logger.info("Bypass complete, cookies refreshed");
              return refreshed;
            }
            return resp;
          }
          const first = await get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
          if (isCp(first)) {
            await bypass(s(first.data));
            const refreshed = await refreshJar();
            if (!isCp(refreshed)) logger.info("Bypass complete, cookies refreshed");
            else logger.warn("Checkpoint still present after refresh");
            return refreshed;
          }
          return first;
        } catch (e) {
          logger.error(`Bypass automation error:`, e);
          return resp;
        }
      };
      if (appState || Cookie) {
        const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        return (await ctx.bypassAutomation(initial, jar)) || initial;
      }
      
      // Try to hydrate from file backup
      const hydrated = await hydrateJarFromFile();
      if (hydrated) {
        logger.info("AppState backup from file — proceeding to login");
        const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        return (await ctx.bypassAutomation(initial, jar)) || initial;
      }
      
      logger.warn("AppState backup unavailable — proceeding to email/password login");
      return get("https://www.facebook.com/", null, null, globalOptions)
        .then(saveCookies(jar))
        .then(makeLogin(jar, email, password, globalOptions))
        .then(function () {
          return get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        });
    })()
      .then(async function (res) {
        const ctx = {};
        ctx.options = globalOptions;
        ctx.bypassAutomation = async function (resp, j) {
          global.fca = global.fca || {};
          global.fca.BypassAutomationNotification = this.bypassAutomation.bind(this);
          const s = x => (typeof x === "string" ? x : String(x ?? ""));
          const u = r => r?.request?.res?.responseUrl || (r?.config?.baseURL ? new URL(r.config.url || "/", r.config.baseURL).toString() : r?.config?.url || "");
          const isCp = r => typeof u(r) === "string" && u(r).includes("checkpoint/601051028565049");
          const cookieUID = async () => {
            try {
              const cookies = typeof j?.getCookies === "function" ? await j.getCookies("https://www.facebook.com") : [];
              return cookies.find(c => c.key === "i_user")?.value || cookies.find(c => c.key === "c_user")?.value;
            } catch { return undefined; }
          };
          const htmlUID = body => s(body).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s(body).match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
          const getUID = async body => (await cookieUID()) || htmlUID(body);
          const refreshJar = async () => get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
          const bypass = async body => {
            const b = s(body);
            const UID = await getUID(b);
            const fb_dtsg = getFrom(b, '"DTSGInitData",[],{"token":"', '",') || b.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
            const jazoest = getFrom(b, 'name="jazoest" value="', '"') || getFrom(b, "jazoest=", '",') || b.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
            const lsd = getFrom(b, '["LSD",[],{"token":"', '"}') || b.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
            const form = { av: UID, fb_dtsg, jazoest, lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: "FBScrapingWarningMutation", variables: "{}", server_timestamps: true, doc_id: 6339492849481770 };
            await post("https://www.facebook.com/api/graphql/", j, form, null, this.options).then(saveCookies(j));
            logger.warn("Facebook automation warning detected, handling...");
          };
          try {
            if (res && isCp(res)) {
              await bypass(s(res.data));
              const refreshed = await refreshJar();
              if (!isCp(refreshed)) logger.info("Bypass complete, cookies refreshed");
              return refreshed;
            }
            logger.info("No checkpoint detected");
            return res;
          } catch {
            return res;
          }
        };
        const processed = (await ctx.bypassAutomation(res, jar)) || res;
        let html = processed && processed.data ? processed.data : "";
        let cookies = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
        const getUIDFromCookies = cs =>
          cs.find(c => c.key === "i_user")?.value ||
          cs.find(c => c.key === "c_user")?.value ||
          cs.find(c => c.name === "i_user")?.value ||
          cs.find(c => c.name === "c_user")?.value;
        const getUIDFromHTML = body => {
          const s = typeof body === "string" ? body : String(body ?? "");
          return s.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s.match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
        };
        let userID = getUIDFromCookies(cookies);
        if (!userID) {
          userID = getUIDFromHTML(html);
        }
        if (!userID && userIDFromAppState) {
          userID = userIDFromAppState;
        }
        if (!userID) {
          const retried = await tryAutoLoginIfNeeded(html, cookies, globalOptions, ctx, !!(appState || Cookie));
          html = retried.html;
          cookies = retried.cookies;
          userID = retried.userID;
        }
        if (html.includes("/checkpoint/block/?next")) {
          logger.error("AppState is invalid, please provide a new one!");
          throw new Error("Checkpoint");
        }
        let mqttEndpoint;
        let region = "PRN";
        let fb_dtsg;
        let irisSeqID;
        try {
          const m1 = html.match(/"endpoint":"([^"]+)"/);
          const m2 = m1 ? null : html.match(/endpoint\\":\\"([^\\"]+)\\"/);
          const raw = (m1 && m1[1]) || (m2 && m2[1]);
          if (raw) mqttEndpoint = raw.replace(/\\\//g, "/");
          region = parseRegion(html);
          const rinfo = REGION_MAP.get(region);
          if (rinfo) logger.info(`Server region ${region} - ${rinfo.name}`);
          else logger.info(`Server region ${region}`);
        } catch {
          logger.warn("Not MQTT endpoint");
        }
        try {
          const userDataMatch = String(html).match(/\["CurrentUserInitialData",\[\],({.*?}),\d+\]/);
          if (userDataMatch) {
            const info = JSON.parse(userDataMatch[1]);
            logger.info(`Logged in as: ${info.NAME} (${info.USER_ID})`);
          } else if (userID) {
            logger.info(`User ID: ${userID}`);
          }
        } catch { }
        const tokenMatch = html.match(/DTSGInitialData.*?token":"(.*?)"/);
        if (tokenMatch) fb_dtsg = tokenMatch[1];
        
        // Backup appstate to file
        try {
          if (userID) await backupAppStateFile(jar, userID);
        } catch { }
        
        logger.info("FCA fix/update by DongDev (Donix-VN)");
        const ctxMain = {
          userID,
          jar,
          globalOptions,
          loggedIn: true,
          access_token: "NONE",
          clientMutationId: 0,
          mqttClient: undefined,
          lastSeqId: irisSeqID,
          syncToken: undefined,
          mqttEndpoint,
          region,
          firstListen: true,
          fb_dtsg,
          clientID: ((Math.random() * 2147483648) | 0).toString(16),
          clientId: getFrom(html, '["MqttWebDeviceID",[],{"clientID":"', '"}') || "",
          wsReqNumber: 0,
          wsTaskNumber: 0,
          tasks: new Map()
        };
        ctxMain.options = globalOptions;
        ctxMain.bypassAutomation = ctx.bypassAutomation.bind(ctxMain);
        ctxMain.performAutoLogin = async () => {
          try {
            const u = config.credentials?.email || email;
            const p = config.credentials?.password || password;
            const tf = config.credentials?.twofactor || null;
            if (!u || !p) return false;
            const r = await tokens(u, p, tf);
            if (!(r && r.status && Array.isArray(r.cookies))) return false;
            const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
            setJarFromPairs(jar, pairs, ".facebook.com");
            await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
            return true;
          } catch {
            return false;
          }
        };
        const api = {
          setOptions: require("./options").setOptions.bind(null, globalOptions),
          getCookies: function () {
            return cookieHeaderFromJar(jar);
          },
          getAppState: function () {
            return getAppState(jar);
          }
        };
        const defaultFuncs = makeDefaults(html, userID, ctxMain);
        const srcRoot = path.join(__dirname, "../src/api");
        let loaded = 0;
        let skipped = 0;
        fs.readdirSync(srcRoot, { withFileTypes: true }).forEach((sub) => {
          if (!sub.isDirectory()) return;
          const subDir = path.join(srcRoot, sub.name);
          fs.readdirSync(subDir, { withFileTypes: true }).forEach((entry) => {
            if (!entry.isFile() || !entry.name.endsWith(".js")) return;
            const p = path.join(subDir, entry.name);
            const key = path.basename(entry.name, ".js");
            if (api[key]) {
              skipped++;
              return;
            }
            api[key] = require(p)(defaultFuncs, api, ctxMain);
            loaded++;
          });
        });
        logger.info(`Loaded ${loaded} FCA API methods${skipped ? `, skipped ${skipped} duplicates` : ""}`);
        if (api.listenMqtt) api.listen = api.listenMqtt;
        if (api.refreshFb_dtsg) {
          setInterval(function () {
            api.refreshFb_dtsg().then(function () {
              logger.info("Successfully refreshed fb_dtsg");
            }).catch(function () {
              logger.error("An error occurred while refreshing fb_dtsg");
            });
          }, 86400000);
        }
        logger.info("Login successful!");
        callback(null, api);
      })
      .catch(function (e) {
        callback(e);
      });
  } catch (e) {
    callback(e);
  }
}

module.exports = loginHelper;