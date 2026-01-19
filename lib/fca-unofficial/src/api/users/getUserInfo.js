"use strict";

const log = require("npmlog");
const logger = require("../../../func/logger");
const { parseAndCheckLogin } = require("../../utils/client.js");

const DOC_PRIMARY = "5009315269112105";
const BATCH_PRIMARY = "MessengerParticipantsFetcher";
const DOC_V2 = "24418640587785718";
const FRIENDLY_V2 = "CometHovercardQueryRendererQuery";
const CALLER_V2 = "RelayModern";

function toJSONMaybe(s) {
  if (!s) return null;
  if (typeof s === "string") {
    const t = s.trim().replace(/^for\s*\(\s*;\s*;\s*\)\s*;/, "");
    try { return JSON.parse(t); } catch { return null; }
  }
  return s;
}

function usernameFromUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (/^www\.facebook\.com$/i.test(u.hostname)) {
      const seg = u.pathname.replace(/^\//, "").replace(/\/$/, "");
      if (seg && !/^profile\.php$/i.test(seg) && !seg.includes("/")) return seg;
    }
  } catch { }
  return null;
}

function pickMeta(u) {
  let friendshipStatus = null;
  let gender = null;
  let shortName = u?.short_name || null;
  const pa = Array.isArray(u?.primaryActions) ? u.primaryActions : [];
  const sa = Array.isArray(u?.secondaryActions) ? u.secondaryActions : [];
  const aFriend = pa.find(x => x?.profile_action_type === "FRIEND");
  if (aFriend?.client_handler?.profile_action?.restrictable_profile_owner) {
    const p = aFriend.client_handler.profile_action.restrictable_profile_owner;
    friendshipStatus = p?.friendship_status || null;
    gender = p?.gender || gender;
    shortName = p?.short_name || shortName;
  }
  if (!gender || !shortName) {
    const aBlock = sa.find(x => x?.profile_action_type === "BLOCK");
    const p2 = aBlock?.client_handler?.profile_action?.profile_owner;
    if (p2) {
      gender = p2.gender || gender;
      shortName = p2.short_name || shortName;
    }
  }
  return { friendshipStatus, gender, shortName };
}

function normalizeV2User(u) {
  if (!u) return null;
  const vanity = usernameFromUrl(u.profile_url || u.url);
  const meta = pickMeta(u);
  return {
    id: u.id || null,
    name: u.name || null,
    firstName: meta.shortName || null,
    vanity: vanity || u.username_for_profile || null,
    thumbSrc: u.profile_picture?.uri || null,
    profileUrl: u.profile_url || u.url || null,
    gender: meta.gender || null,
    type: "User",
    isFriend: meta.friendshipStatus === "ARE_FRIENDS",
    isMessengerUser: null,
    isMessageBlockedByViewer: false,
    workInfo: null,
    messengerStatus: null
  };
}

function normalizePrimaryActor(a) {
  if (!a) return null;
  return {
    id: a.id || null,
    name: a.name || null,
    firstName: a.short_name || null,
    vanity: a.username || null,
    thumbSrc: a.big_image_src?.uri || null,
    profileUrl: a.url || null,
    gender: a.gender || null,
    type: a.__typename || null,
    isFriend: !!a.is_viewer_friend,
    isMessengerUser: !!a.is_messenger_user,
    isMessageBlockedByViewer: !!a.is_message_blocked_by_viewer,
    workInfo: a.work_info || null,
    messengerStatus: a.messenger_account_status_category || null
  };
}

function mergeUserEntry(a, b) {
  if (!a && !b) return null;
  const x = a || {};
  const y = b || {};
  return {
    id: x.id || y.id || null,
    name: x.name || y.name || null,
    firstName: x.firstName || y.firstName || null,
    vanity: x.vanity || y.vanity || null,
    thumbSrc: x.thumbSrc || y.thumbSrc || null,
    profileUrl: x.profileUrl || y.profileUrl || null,
    gender: x.gender || y.gender || null,
    type: x.type || y.type || null,
    isFriend: typeof x.isFriend === "boolean" ? x.isFriend : (typeof y.isFriend === "boolean" ? y.isFriend : false),
    isMessengerUser: typeof x.isMessengerUser === "boolean" ? x.isMessengerUser : (typeof y.isMessengerUser === "boolean" ? y.isMessengerUser : null),
    isMessageBlockedByViewer: typeof x.isMessageBlockedByViewer === "boolean" ? x.isMessageBlockedByViewer : (typeof y.isMessageBlockedByViewer === "boolean" ? y.isMessageBlockedByViewer : false),
    workInfo: x.workInfo || y.workInfo || null,
    messengerStatus: x.messengerStatus || y.messengerStatus || null
  };
}

module.exports = function (defaultFuncs, api, ctx) {
  /**
   * Fetch user info from Facebook GraphQL API (primary method)
   * @param {string[]} ids - Array of user IDs
   * @returns {Promise<Object>} - Map of user ID to user info
   */
  async function fetchPrimary(ids) {
    const form = {
      queries: JSON.stringify({
        o0: {
          doc_id: DOC_PRIMARY,
          query_params: { ids }
        }
      }),
      batch_name: BATCH_PRIMARY
    };
    const resData = await defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form).then(parseAndCheckLogin(ctx, defaultFuncs));
    if (!resData || resData.length === 0) throw new Error("Empty response");
    const first = resData[0];
    if (!first || !first.o0) throw new Error("Invalid batch payload");
    if (first.o0.errors && first.o0.errors.length) throw new Error(first.o0.errors[0].message || "GraphQL error");
    const result = first.o0.data;
    if (!result || !Array.isArray(result.messaging_actors)) return {};
    const out = {};
    for (const actor of result.messaging_actors) {
      const n = normalizePrimaryActor(actor);
      if (n?.id) out[n.id] = n;
    }
    return out;
  }

  /**
   * Fetch single user info using V2 API (fallback method)
   * @param {string} uid - User ID
   * @returns {Promise<Object>} - Map of user ID to user info
   */
  async function fetchV2One(uid) {
    const av = String(ctx?.userID || "");
    const variablesObj = {
      actionBarRenderLocation: "WWW_COMET_HOVERCARD",
      context: "DEFAULT",
      entityID: String(uid),
      scale: 1,
      __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false
    };
    const form = {
      av,
      fb_api_caller_class: CALLER_V2,
      fb_api_req_friendly_name: FRIENDLY_V2,
      server_timestamps: true,
      doc_id: DOC_V2,
      variables: JSON.stringify(variablesObj)
    };
    const raw = await defaultFuncs.post("https://www.facebook.com/api/graphql/", null, form).then(parseAndCheckLogin(ctx, defaultFuncs));
    const parsed = toJSONMaybe(raw) ?? raw;
    const root = Array.isArray(parsed) ? parsed[0] : parsed;
    const user = root?.data?.node?.comet_hovercard_renderer?.user || null;
    const n = normalizeV2User(user);
    return n && n.id ? { [n.id]: n } : {};
  }

  /**
   * Fetch and return user info (no persistence)
   * @param {string[]} ids - Array of user IDs
   * @param {boolean} useFallback - Whether to use V2 fallback for missing users
   * @returns {Promise<Object>} - Map of user ID to user info
   */
  async function fetchUserInfo(ids, useFallback = true) {
    const result = {};
    try {
      const primary = await fetchPrimary(ids);
      for (const id of ids) result[id] = primary[id] || null;
    } catch (e) {
      logger.warn(`primary fetch error:`, e);
    }
    if (useFallback) {
      const needFallback = ids.filter(id => !result[id]);
      if (needFallback.length) {
        const tasks = needFallback.map(id => fetchV2One(id).catch(() => ({})));
        const r = await Promise.allSettled(tasks);
        for (let i = 0; i < needFallback.length; i++) {
          const id = needFallback[i];
          const ok = r[i].status === "fulfilled" ? r[i].value : {};
          const n = ok[id] || null;
          result[id] = n || null;
        }
      }
    }
    return result;
  }

  /**
   * Get user information by user ID
   * @param {string|string[]} idsOrId - User ID or array of user IDs
   * @param {Function} [callback] - Optional callback function
   * @returns {Promise<Object>} - Map of user ID to user info
   */
  return function getUserInfo(idsOrId, callback) {
    let resolveFunc, rejectFunc;
    const returnPromise = new Promise((resolve, reject) => { resolveFunc = resolve; rejectFunc = reject; });
    if (typeof callback !== "function") {
      callback = (err, data) => { if (err) return rejectFunc(err); resolveFunc(data); };
    }
    const ids = Array.isArray(idsOrId) ? idsOrId.map(v => String(v)) : [String(idsOrId)];
    
    fetchUserInfo(ids, true)
      .then(fetched => {
        const ret = {};
        for (const id of ids) {
          ret[id] = fetched[id] || {
            id,
            name: null,
            firstName: null,
            vanity: null,
            thumbSrc: null,
            profileUrl: null,
            gender: null,
            type: null,
            isFriend: false,
            isMessengerUser: null,
            isMessageBlockedByViewer: false,
            workInfo: null,
            messengerStatus: null
          };
        }
        return callback(null, ret);
      })
      .catch(err => {
        log.error("getUserInfo", "Error: " + (err?.message || "Unknown"));
        callback(err);
      });
    
    return returnPromise;
  };
};