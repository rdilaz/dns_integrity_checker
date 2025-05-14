document.addEventListener('DOMContentLoaded', () => {
  // Elements for alerts
  const alertList = document.getElementById('alert-list');
  const statusDiv = document.getElementById('status');
  const clearButton = document.getElementById('clear-alerts-btn');

  // Elements for monitoring toggle
  const toggleSwitch = document.getElementById('extension-enabled-toggle');
  const toggleLabel = document.getElementById('toggle-label');

  // Elements for custom allowlist
  const allowlistInput = document.getElementById('allowlist-domain-input');
  const addAllowlistBtn = document.getElementById('add-to-allowlist-btn');
  const customAllowlistUl = document.getElementById('custom-allowlist-ul');
  const customAllowlistStatus = document.getElementById('custom-allowlist-status');

  // --- Initialize Monitoring Toggle State ---
  chrome.storage.local.get({ extensionEnabled: true }, (result) => {
    toggleSwitch.checked = result.extensionEnabled;
    updateToggleLabel(result.extensionEnabled);
  });

  toggleSwitch.addEventListener('change', () => {
    const isEnabled = toggleSwitch.checked;
    chrome.storage.local.set({ extensionEnabled: isEnabled }, () => {
      updateToggleLabel(isEnabled);
      console.log(`DNS Integrity Checker monitoring ${isEnabled ? 'Enabled' : 'Disabled'}`);
    });
  });

  function updateToggleLabel(isEnabled) {
    toggleLabel.textContent = isEnabled ? 'Monitoring Enabled' : 'Monitoring Disabled';
  }

  // --- Custom Domain Allowlist Logic ---
  async function loadCustomAllowlist() {
    try {
      const { customAllowlist = [] } = await chrome.storage.local.get({ customAllowlist: [] });
      renderCustomAllowlist(customAllowlist);
    } catch (error) {
      console.error("Error loading custom allowlist:", error);
      customAllowlistStatus.textContent = 'Error loading allowlist.';
    }
  }

  function renderCustomAllowlist(list) {
    customAllowlistUl.innerHTML = '';
    if (list.length === 0) {
      customAllowlistStatus.textContent = 'No custom domains allowlisted.';
      return;
    }
    customAllowlistStatus.textContent = '';

    list.forEach(domain => {
      const li = document.createElement('li');
      li.className = 'custom-allowlist-item';
      const domainSpan = document.createElement('span');
      domainSpan.textContent = domain;
      li.appendChild(domainSpan);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-allowlist-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.type = 'button';
      removeBtn.dataset.domain = domain; // Store domain for easy removal
      removeBtn.addEventListener('click', async (event) => {
        const domainToRemove = event.target.dataset.domain;
        await removeDomainFromAllowlist(domainToRemove);
      });
      li.appendChild(removeBtn);
      customAllowlistUl.appendChild(li);
    });
  }

  addAllowlistBtn.addEventListener('click', async () => {
    let domainToAdd = allowlistInput.value.trim().toLowerCase();
    if (!domainToAdd) {
      alert('Please enter a domain or suffix.');
      return;
    }
    if (!domainToAdd.startsWith('.') && !domainToAdd.includes('.')) {
      alert('Invalid domain format. Use ".example.com" or "specific.example.com".');
      return;
    }
    if (domainToAdd === ".") {
        alert('Invalid entry. Please enter a valid domain or suffix.');
        return;
    }
    try {
      const { customAllowlist = [] } = await chrome.storage.local.get({ customAllowlist: [] });
      if (!customAllowlist.includes(domainToAdd)) {
        const newList = [...customAllowlist, domainToAdd].sort();
        await chrome.storage.local.set({ customAllowlist: newList });
        renderCustomAllowlist(newList);
        allowlistInput.value = '';
      } else {
        alert(`'${domainToAdd}' is already in the allowlist.`);
      }
    } catch (error) {
        console.error("Error adding to allowlist:", error);
        alert("Error adding to allowlist. Check console.");
    }
  });

  async function removeDomainFromAllowlist(domainToRemove) {
    try {
      const { customAllowlist = [] } = await chrome.storage.local.get({ customAllowlist: [] });
      const newList = customAllowlist.filter(d => d !== domainToRemove);
      await chrome.storage.local.set({ customAllowlist: newList });
      renderCustomAllowlist(newList);
    } catch (error) {
      console.error("Error removing from allowlist:", error);
      alert("Error removing from allowlist. Check console.");
    }
  }

  // --- Load Recent Alerts ---
  clearButton.addEventListener('click', clearAlerts);
  loadAlerts(); // Initial load
  loadCustomAllowlist(); // Initial load

  // --- LISTEN FOR STORAGE CHANGES TO UPDATE ALERT LIST DYNAMICALLY ---
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.dnsAlerts) {
      // console.log('dnsAlerts in storage changed, reloading alert list in popup.');
      // The new value is in changes.dnsAlerts.newValue
      // We can just call loadAlerts which reads the latest from storage
      loadAlerts();
    }
    if (namespace === 'local' && changes.customAllowlist) {
        // If another part of the extension (or user action in another popup) changed the custom allowlist
        // console.log('customAllowlist in storage changed, reloading custom allowlist in popup.');
        loadCustomAllowlist();
    }
  });

  // Function to load and display recent alerts
  async function loadAlerts() {
    try {
      const result = await chrome.storage.local.get({ dnsAlerts: [] });
      const alerts = result.dnsAlerts;
      alertList.innerHTML = '';
      if (alerts && alerts.length > 0) {
        statusDiv.textContent = '';
        alerts.forEach(alert => {
          const listItem = createAlertListItem(alert);
          alertList.appendChild(listItem);
        });
      } else {
        statusDiv.textContent = 'No alerts recorded recently.';
      }
    } catch (error) {
      console.error('Error loading alerts:', error);
      statusDiv.textContent = 'Error loading alerts.';
    }
  }

  // Function to create an alert list item (HTML)
  function createAlertListItem(alert) {
    const item = document.createElement('li');
    item.className = 'alert-item';
    const time = new Date(alert.timestamp).toLocaleString();
    const domainStrong = `<strong>${escapeHtml(alert.domain)}</strong>`;
    const connectedIpEm = `<em>${escapeHtml(alert.connectedIp)}</em>`;
    const dohIpsFormatted = Array.isArray(alert.dohIps) && alert.dohIps.length > 0 ? escapeHtml(alert.dohIps.join(', ')) : 'None';
    item.innerHTML = `
      <div class="alert-time">${escapeHtml(time)}</div>
      <div class="alert-domain">Domain: ${domainStrong}</div>
      <div class="alert-ip">Connected IP: ${connectedIpEm} (Suspicious)</div>
      <div class="alert-doh">DoH IPs: ${dohIpsFormatted}</div>
      ${alert.url ? `<div class="alert-url">URL: <a href="${escapeHtml(alert.url)}" target="_blank" title="${escapeHtml(alert.url)}">${escapeHtml(alert.url.length > 60 ? alert.url.substring(0, 57) + '...' : alert.url)}</a></div>` : ''}
    `;
    return item;
  }

  // Function to clear all stored alerts
  async function clearAlerts() {
    try {
      await chrome.storage.local.remove('dnsAlerts');
      console.log('Cleared stored DNS alerts.');
      alertList.innerHTML = '';
      statusDiv.textContent = 'Alerts cleared.';
    } catch (error) {
      console.error('Error clearing alerts:', error);
      statusDiv.textContent = 'Error clearing alerts.';
    }
  }

  // Basic HTML escaping function
   function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "\"")
         .replace(/'/g, "'");
   }
});