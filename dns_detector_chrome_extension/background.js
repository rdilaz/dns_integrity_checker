// Import helper functions from helpers.js for DNS lookups, IP comparisons, and allowlisting
import { dohLookup, isIpRelatedToDohSet, isCdnAllowlisted } from "./helpers.js";

// Limits the number of recent alerts stored in local storage
const MAX_ALERTS = 20;

// Register the extension to listen for all completed web requests
chrome.webRequest.onCompleted.addListener(handleRequestCompleted, {
  urls: ["<all_urls>"], // Listen to all URLs
  types: ["main_frame", "sub_frame"], // Only check main pages and frames
});

// This function handles completed web requests
async function handleRequestCompleted(details) {
  // Check if extension is enabled in storage
  const { extensionEnabled } = await chrome.storage.local.get({
    extensionEnabled: true,
  });
  if (!extensionEnabled) {
    return; // Skip if disabled
  }

  // Skip if no IP or not HTTP(S)
  if (!details.ip || !details.url.startsWith("http")) {
    return;
  }

  // Extract domain
  let domain;
  try {
    const url = new URL(details.url);
    domain = url.hostname;
    if (
      !domain ||
      domain === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(domain)
    ) {
      return;
    }
  } catch (e) {
    console.error(
      `[${new Date().toISOString()}] Error parsing URL: ${details.url}`,
      e
    );
    return;
  }

  const ipSeen = details.ip;
  // console.debug( // Reduced default logging to avoid clutter, enable if needed
  //   `[${new Date().toISOString()}] Request Completed (Monitoring ON): Domain=${domain}, Connected IP=${ipSeen}, URL=${details.url}`
  // );

  try {
    // STEP 1: Check if the domain is on the combined (default + custom) allowlist
    // isCdnAllowlisted is now async as it fetches custom list from storage
    const isDomainAllowlisted = await isCdnAllowlisted(ipSeen, domain);
    // console.debug( // Reduced default logging
    //   `[${new Date().toISOString()}] Checking ${domain}: Is Allowlisted (default + custom)? ${isDomainAllowlisted}`
    // );

    // If the domain is allowlisted, we stop further processing for this request
    if (isDomainAllowlisted) {
      console.debug(
        `[${new Date().toISOString()}] OK for ${domain}: Domain is on an allowlist (default or custom). Skipping IP checks.`
      );
      return;
    }

    // STEP 2: If NOT allowlisted, proceed to fetch DoH IPs
    const dohIps = await dohLookup(domain);
    // console.debug(`[${new Date().toISOString()}] DoH Results for ${domain}:`, [ // Reduced default logging
    //   ...dohIps,
    // ]);

    // If DoH lookup failed (and not allowlisted), we can't compare.
    if (dohIps.size === 0) { // We know it's not allowlisted at this point
      console.warn(
        `[${new Date().toISOString()}] DoH lookup failed or returned no IPs for non-allowlisted domain ${domain}. Cannot compare.`
      );
      return;
    }

    // STEP 3: If NOT allowlisted AND DoH succeeded, compare IPs
    const isConsideredMatch = isIpRelatedToDohSet(ipSeen, dohIps);
    // console.debug( // Reduced default logging
    //   `[${new Date().toISOString()}] Checking ${domain}: Is ${ipSeen} related (exact match or similar range) to DoH set? ${isConsideredMatch}`
    // );

    // STEP 4: Trigger alert if NOT allowlisted AND IPs don't match/relate
    if (!isConsideredMatch) { // We already know isDomainAllowlisted is false here
      const notificationId = `dns-alert-${domain}-${ipSeen}-${Date.now()}`;
      const dohIpList = [...dohIps].join(", ") || "None from DoH";
      const message = `Browser connected to ${ipSeen}, but trusted DNS (DoH) resolved to: ${dohIpList}. This might indicate DNS interference.`;
      const title = `DNS Alert: ${domain}`;

      console.warn(
        `[${new Date().toISOString()}] ALERT Triggered for ${domain}! (Not Allowlisted & IP Relationship Check Failed)`,
        {
          connectedIp: ipSeen,
          dohIpSet: dohIps,
          isConsideredMatch: isConsideredMatch, // Will be false here
          isDomainAllowlisted: isDomainAllowlisted, // Will be false here
          url: details.url,
        }
      );

      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: title,
        message: message,
        priority: 2,
      });

      await storeAlert({
        timestamp: new Date().toISOString(),
        domain: domain,
        connectedIp: ipSeen,
        dohIps: [...dohIps],
        url: details.url,
      });
    } else {
      // If IPs match/relate (and not allowlisted), log as OK
      console.debug(
        `[${new Date().toISOString()}] OK for ${domain}: Not allowlisted, but Connected IP ${ipSeen} matches or is related to DoH set.`
      );
    }
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error processing request for ${domain}:`,
      error
    );
  }
}

// Stores alert data in Chrome's local storage
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

// Clear any badge text when the extension starts up
chrome.runtime.onStartup.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
});