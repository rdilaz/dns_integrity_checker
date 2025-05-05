// Import helper functions
// Note: We import isCdnAllowlisted still, but won't use its result for alerting.
import { dohLookup, isIpRelatedToDohSet, isCdnAllowlisted } from './helpers.js';

const MAX_ALERTS = 20; // Max number of alerts to store

// --- Main Listener ---
chrome.webRequest.onCompleted.addListener(
  handleRequestCompleted,
  {
    urls: ["<all_urls>"],
    types: ["main_frame", "sub_frame"]
  }
);

/**
 * Handles a completed web request.
 * Fetches DoH results for the domain and compares the connected IP.
 * Sends a notification if the connected IP doesn't match exactly AND
 * doesn't appear to be in a similar network range as any DoH result.
 * @param {object} details - Details about the completed request.
 */
async function handleRequestCompleted(details) {
  // Basic filtering
  if (!details.ip || !details.url.startsWith('http')) {
    return;
  }

  let domain;
  try {
    const url = new URL(details.url);
    domain = url.hostname;
    if (!domain || domain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
        return;
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error parsing URL: ${details.url}`, e);
    return;
  }

  const ipSeen = details.ip;
  console.debug(`[${new Date().toISOString()}] Request Completed: Domain=${domain}, Connected IP=${ipSeen}, URL=${details.url}`);

  try {
    // 1. Fetch trusted DNS results via DoH (A and AAAA)
    const dohIps = await dohLookup(domain);
    console.debug(`[${new Date().toISOString()}] DoH Results for ${domain}:`, [...dohIps]);

    if (dohIps.size === 0) {
      console.warn(`[${new Date().toISOString()}] DoH lookup failed or returned no IPs for ${domain}. Skipping comparison.`);
      return;
    }

    // 2. Check if connected IP matches exactly or is in a similar range to DoH results
    const isConsideredMatch = isIpRelatedToDohSet(ipSeen, dohIps);
    console.debug(`[${new Date().toISOString()}] Checking ${domain}: Is ${ipSeen} related (exact match or similar range) to DoH set? ${isConsideredMatch}`);

    // 3. Trigger notification ONLY IF no relationship was found
    if (!isConsideredMatch) {
      const notificationId = `dns-alert-${domain}-${ipSeen}-${Date.now()}`;
      const dohIpList = [...dohIps].join(', ') || 'None';
      const message = `Browser connected to ${ipSeen}, but trusted DNS (DoH) resolved to: ${dohIpList}. This might indicate DNS interference.`;
      const title = `DNS Alert: ${domain}`;

      // Log detailed alert info to console
      console.warn(`[${new Date().toISOString()}] ALERT Triggered for ${domain}! (IP not in DoH set or similar range)`, {
          connectedIp: ipSeen,
          dohIpSet: dohIps,
          isConsideredMatch: isConsideredMatch, // Will be false here
          url: details.url
      });

      // Create a Chrome notification
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: message,
        priority: 2
      });

      // Store the alert for the popup
      await storeAlert({
        timestamp: new Date().toISOString(),
        domain: domain,
        connectedIp: ipSeen,
        dohIps: [...dohIps],
        url: details.url,
      });
    } else {
        // Log why no alert was triggered
       console.debug(`[${new Date().toISOString()}] OK for ${domain}: Connected IP ${ipSeen} matches or is related to DoH set.`);
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing request for ${domain}:`, error);
  }
}

/**
 * Stores a new alert in chrome.storage.local, keeping only the most recent ones.
 * @param {object} alertData - The alert data to store.
 */
async function storeAlert(alertData) {
  try {
    const result = await chrome.storage.local.get({ dnsAlerts: [] });
    let alerts = result.dnsAlerts;
    alerts.unshift(alertData);
    if (alerts.length > MAX_ALERTS) {
      alerts = alerts.slice(0, MAX_ALERTS);
    }
    await chrome.storage.local.set({ dnsAlerts: alerts });
  } catch (error) {
    console.error("Error storing alert:", error);
  }
}

// Optional: Clear badge on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});