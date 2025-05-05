document.addEventListener('DOMContentLoaded', () => {
    const alertList = document.getElementById('alert-list');
    const statusDiv = document.getElementById('status');
    const clearButton = document.getElementById('clear-alerts-btn');
  
    // Load alerts from storage when popup opens
    loadAlerts();
  
    // Add event listener for the clear button
    clearButton.addEventListener('click', clearAlerts);
  
    /**
     * Loads alerts from chrome.storage.local and displays them.
     */
    async function loadAlerts() {
      try {
        const result = await chrome.storage.local.get({ dnsAlerts: [] });
        const alerts = result.dnsAlerts;
  
        alertList.innerHTML = ''; // Clear previous list
  
        if (alerts && alerts.length > 0) {
          statusDiv.textContent = ''; // Hide loading/empty message
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
  
    /**
     * Creates an HTML list item element for a single alert.
     * @param {object} alert - The alert data object.
     * @returns {HTMLElement} The created list item element.
     */
    function createAlertListItem(alert) {
      const item = document.createElement('li');
      item.className = 'alert-item';
  
      const time = new Date(alert.timestamp).toLocaleString();
      const domainStrong = `<strong>${escapeHtml(alert.domain)}</strong>`;
      const connectedIpEm = `<em>${escapeHtml(alert.connectedIp)}</em>`;
      const dohIpsFormatted = alert.dohIps.length > 0 ? escapeHtml(alert.dohIps.join(', ')) : 'None';
  
      item.innerHTML = `
        <div class="alert-time">${escapeHtml(time)}</div>
        <div class="alert-domain">Domain: ${domainStrong}</div>
        <div class="alert-ip">Connected IP: ${connectedIpEm} (Suspicious)</div>
        <div class="alert-doh">DoH IPs: ${dohIpsFormatted}</div>
        ${alert.url ? `<div class="alert-url">URL: <a href="${escapeHtml(alert.url)}" target="_blank" title="${escapeHtml(alert.url)}">Link</a></div>` : ''}
      `;
      // Add tooltip for full URL if needed, or shorten display
      const urlLink = item.querySelector('.alert-url a');
      if (urlLink && alert.url.length > 60) {
          urlLink.textContent = escapeHtml(alert.url.substring(0, 60)) + '...';
      } else if(urlLink) {
          urlLink.textContent = escapeHtml(alert.url);
      }
  
  
      return item;
    }
  
    /**
     * Clears all stored alerts from chrome.storage.local and updates the UI.
     */
    async function clearAlerts() {
      try {
        await chrome.storage.local.remove('dnsAlerts');
        console.log('Cleared stored DNS alerts.');
        alertList.innerHTML = ''; // Clear the list in the UI
        statusDiv.textContent = 'Alerts cleared.';
      } catch (error) {
        console.error('Error clearing alerts:', error);
        statusDiv.textContent = 'Error clearing alerts.';
      }
    }
  
     /**
     * Basic HTML escaping function
     */
     function escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
           .replace(/&/g, "&")
           .replace(/</g, "<")
           .replace(/>/g, ">")
           .replace(/"/g, '"')
           .replace(/'/g, "'");
   }
  
  });