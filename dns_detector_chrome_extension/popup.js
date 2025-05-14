// Initialize the popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // UI element references
  const alertList = document.getElementById("alert-list");
  const statusDiv = document.getElementById("status");
  const clearButton = document.getElementById("clear-alerts-btn");
  const toggleSwitch = document.getElementById("extension-enabled-toggle");
  const toggleLabel = document.getElementById("toggle-label");

  // Set toggle based on stored state
  chrome.storage.local.get({ extensionEnabled: true }, (result) => {
    toggleSwitch.checked = result.extensionEnabled;
    updateToggleLabel(result.extensionEnabled);
  });

  // Handle toggle changes
  toggleSwitch.addEventListener("change", () => {
    const isEnabled = toggleSwitch.checked;
    chrome.storage.local.set({ extensionEnabled: isEnabled }, () => {
      updateToggleLabel(isEnabled);
      console.log(`Extension turned ${isEnabled ? "ON" : "OFF"}`);
    });
  });

  // Update toggle label text
  function updateToggleLabel(isEnabled) {
    toggleLabel.textContent = isEnabled
      ? "Monitoring Enabled"
      : "Monitoring Disabled";
  }

  // Load alerts when popup opens
  loadAlerts();

  // Set up clear button
  clearButton.addEventListener("click", clearAlerts);

  // Fetch and display alerts from storage
  async function loadAlerts() {
    try {
      const result = await chrome.storage.local.get({ dnsAlerts: [] });
      const alerts = result.dnsAlerts;

      // Clear existing alerts
      alertList.innerHTML = "";

      if (alerts && alerts.length > 0) {
        statusDiv.textContent = "";
        alerts.forEach((alert) => {
          const listItem = createAlertListItem(alert);
          alertList.appendChild(listItem);
        });
      } else {
        statusDiv.textContent = "No alerts recorded recently.";
      }
    } catch (error) {
      console.error("Error loading alerts:", error);
      statusDiv.textContent = "Error loading alerts.";
    }
  }

  // Create alert list item with timestamp and details
  function createAlertListItem(alert) {
    const item = document.createElement("li");
    item.className = "alert-item";

    const time = new Date(alert.timestamp).toLocaleString();

    // Populate HTML with alert details
    item.innerHTML = `
      <div class="alert-time">${escapeHtml(time)}</div>
      <div class="alert-domain">Domain: <strong>${escapeHtml(
        alert.domain
      )}</strong></div>
      <div class="alert-ip">Connected IP: <em>${escapeHtml(
        alert.connectedIp
      )}</em> (Suspicious)</div>
      <div class="alert-doh">DoH IPs: ${escapeHtml(
        alert.dohIps.join(", ") || "None"
      )}</div>
      ${
        alert.url
          ? `<div class="alert-url">URL: <a href="${escapeHtml(
              alert.url
            )}" target="_blank" title="${escapeHtml(alert.url)}">Link</a></div>`
          : ""
      }
    `;

    // Truncate long URLs
    const urlLink = item.querySelector(".alert-url a");
    if (urlLink && alert.url.length > 60) {
      urlLink.textContent = escapeHtml(alert.url.substring(0, 60)) + "...";
    } else if (urlLink) {
      urlLink.textContent = escapeHtml(alert.url);
    }

    return item;
  }

  // Clear all alerts from storage and UI
  async function clearAlerts() {
    try {
      await chrome.storage.local.remove("dnsAlerts");
      console.log("Cleared alerts.");
      alertList.innerHTML = "";
      statusDiv.textContent = "Alerts cleared.";
    } catch (error) {
      console.error("Error clearing alerts:", error);
      statusDiv.textContent = "Error clearing alerts.";
    }
  }

  // Prevent XSS by escaping HTML
  function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
});
