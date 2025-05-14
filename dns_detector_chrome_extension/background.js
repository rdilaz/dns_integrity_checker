// Import helper functions from helpers.js for DNS lookups and IP comparisons
import { dohLookup, isIpRelatedToDohSet, isCdnAllowlisted } from "./helpers.js";

// Limits the number of recent alerts stored in local storage
const MAX_ALERTS = 20;

// Register the extension to listen for all completed web requests
// This is the main entry point when a web page finishes loading
chrome.webRequest.onCompleted.addListener(handleRequestCompleted, {
  urls: ["<all_urls>"], // Listen to all URLs
  types: ["main_frame", "sub_frame"], // Only check main pages and frames, not resources
});

// This function handles completed web requests
// It checks if the IP we connected to matches what the DoH says it should be
// and sends an alert if they don't match
async function handleRequestCompleted(details) {
  // Check if extension is enabled in storage (defaults to true if not set)
  const { extensionEnabled } = await chrome.storage.local.get({
    extensionEnabled: true,
  });
  if (!extensionEnabled) {
    // Skip processing if the extension is disabled
    return;
  }

  // Skip checking if no IP address or not an HTTP(S) request
  if (!details.ip || !details.url.startsWith("http")) {
    return;
  }

  // Extract the domain from the URL for DNS lookups
  let domain;
  try {
    const url = new URL(details.url);
    domain = url.hostname;
    // Skip checking localhost, IP addresses, or empty domains
    if (
      !domain ||
      domain === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(domain) // Check if domain is actually an IPv4 address
    ) {
      return;
    }
  } catch (e) {
    // Log error if URL parsing fails
    console.error(
      `[${new Date().toISOString()}] Error parsing URL: ${details.url}`,
      e
    );
    return;
  }

  // Store the IP address that the browser actually connected to
  const ipSeen = details.ip;
  console.debug(
    `[${new Date().toISOString()}] Request Completed (Monitoring ON): Domain=${domain}, Connected IP=${ipSeen}, URL=${
      details.url
    }`
  );

  try {
    // Get IPs from trusted DNS over HTTPS provider
    const dohIps = await dohLookup(domain);
    console.debug(`[${new Date().toISOString()}] DoH Results for ${domain}:`, [
      ...dohIps,
    ]);

    // Skip if DoH lookup failed or returned no results
    if (dohIps.size === 0) {
      console.warn(
        `[${new Date().toISOString()}] DoH lookup failed or returned no IPs for ${domain}. Skipping comparison.`
      );
      return;
    }

    // Check if connected IP matches or is similar to DoH results
    // This uses both exact match and network range comparisons (/16 for IPv4, /48 for IPv6)
    const isConsideredMatch = isIpRelatedToDohSet(ipSeen, dohIps);
    console.debug(
      `[${new Date().toISOString()}] Checking ${domain}: Is ${ipSeen} related (exact match or similar range) to DoH set? ${isConsideredMatch}`
    );

    // isCdnAllowlisted is currently a stub, so its result is not primarily used for alerting logic here.
    // const allowlistedByDomain = isCdnAllowlisted(ipSeen, domain);

    // Show notification if no match found - this might indicate DNS spoofing
    if (!isConsideredMatch) {
      // Create unique notification ID that includes domain, IP and timestamp
      const notificationId = `dns-alert-${domain}-${ipSeen}-${Date.now()}`;
      // Format the list of IPs from DoH for the message
      const dohIpList = [...dohIps].join(", ") || "None";
      const message = `Browser connected to ${ipSeen}, but trusted DNS (DoH) resolved to: ${dohIpList}. This might indicate DNS interference.`;
      const title = `DNS Alert: ${domain}`;

      // Log the alert details
      console.warn(
        `[${new Date().toISOString()}] ALERT Triggered for ${domain}! (IP not in DoH set or similar range)`,
        {
          connectedIp: ipSeen,
          dohIpSet: dohIps,
          isConsideredMatch: isConsideredMatch, // Will be false here
          url: details.url,
        }
      );

      // Create browser notification to alert the user
      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: title,
        message: message,
        priority: 2, // High priority
      });

      // Save the alert to local storage for viewing in the popup
      await storeAlert({
        timestamp: new Date().toISOString(),
        domain: domain,
        connectedIp: ipSeen,
        dohIps: [...dohIps],
        url: details.url,
      });
    } else {
      // If connected IP matches one from DoH, everything is normal
      console.debug(
        `[${new Date().toISOString()}] OK for ${domain}: Connected IP ${ipSeen} matches or is related to DoH set.`
      );
    }
  } catch (error) {
    // Log any errors during processing
    console.error(
      `[${new Date().toISOString()}] Error processing request for ${domain}:`,
      error
    );
  }
}

// Stores alert data in Chrome's local storage
// Maintains a queue of the MAX_ALERTS most recent alerts
async function storeAlert(alertData) {
  try {
    // Get existing alerts from storage
    const result = await chrome.storage.local.get({ dnsAlerts: [] });
    let alerts = result.dnsAlerts;
    // Add new alert to the beginning of the array
    alerts.unshift(alertData);
    // Limit the number of stored alerts
    if (alerts.length > MAX_ALERTS) {
      alerts = alerts.slice(0, MAX_ALERTS);
    }
    // Save back to storage
    await chrome.storage.local.set({ dnsAlerts: alerts });
  } catch (error) {
    console.error("Error storing alert:", error);
  }
}

// Clear any badge text when the extension starts up
chrome.runtime.onStartup.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
});
