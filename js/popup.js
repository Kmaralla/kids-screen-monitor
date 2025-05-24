// Popup script for KidsWatch extension

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadTodayStats();
    
    // Event listeners
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('testEmail').addEventListener('click', testEmail);
    document.getElementById('viewReports').addEventListener('click', viewReports);
    document.getElementById('enableToggle').addEventListener('change', updateStatus);
  });
  
  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get(['settings', 'emailjsConfig']);
      const settings = data.settings || {};
      const emailjsConfig = data.emailjsConfig || {};
      
      document.getElementById('enableToggle').checked = settings.isEnabled !== false;
      document.getElementById('timeoutInput').value = settings.timeoutMinutes || 5;
      document.getElementById('emailInput').value = settings.parentEmail || '';
      document.getElementById('allowlistInput').value = (settings.allowlist || []).join('\n');
      
      // Load EmailJS config if it exists
      if (emailjsConfig.serviceId) {
        // We'll show this in the EmailJS setup section
        console.log('EmailJS configuration found');
      }
      
      updateStatus();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }
  
  async function saveSettings() {
    try {
      const settings = {
        isEnabled: document.getElementById('enableToggle').checked,
        timeoutMinutes: parseInt(document.getElementById('timeoutInput').value) || 5,
        parentEmail: document.getElementById('emailInput').value.trim(),
        allowlist: document.getElementById('allowlistInput').value
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
      };
      
      await chrome.storage.local.set({ settings });
      
      // Show success feedback
      const btn = document.getElementById('saveSettings');
      const originalText = btn.textContent;
      btn.textContent = '✅ Saved!';
      btn.style.background = 'rgba(76, 175, 80, 0.5)';
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 2000);
      
      updateStatus();
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings. Please try again.');
    }
  }
  
  async function loadTodayStats() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await chrome.storage.local.get(`usage_${today}`);
      const usageData = data[`usage_${today}`] || {};
      
      const sites = Object.entries(usageData).map(([domain, data]) => ({
        domain,
        timeMinutes: Math.round(data.time / (1000 * 60)),
        visits: data.visits
      })).sort((a, b) => b.timeMinutes - a.timeMinutes);
      
      const totalTime = sites.reduce((sum, site) => sum + site.timeMinutes, 0);
      
      document.getElementById('totalTime').textContent = `${totalTime} min`;
      document.getElementById('sitesCount').textContent = sites.length;
      
      const siteList = document.getElementById('siteList');
      if (sites.length === 0) {
        siteList.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.6);">No browsing today</div>';
      } else {
        siteList.innerHTML = sites.map(site => `
          <div class="site-item">
            <span>${site.domain}</span>
            <span>${site.timeMinutes}m (${site.visits}x)</span>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Error loading today stats:', error);
    }
  }
  
  function updateStatus() {
    const isEnabled = document.getElementById('enableToggle').checked;
    const statusDiv = document.getElementById('status');
    
    if (isEnabled) {
      statusDiv.textContent = '🟢 Protection Active';
      statusDiv.className = 'status enabled';
    } else {
      statusDiv.textContent = '🔴 Protection Disabled';
      statusDiv.className = 'status disabled';
    }
  }
  
  async function testEmail() {
    try {
      const settings = await chrome.storage.local.get(['settings', 'emailjsConfig']);
      
      if (!settings.settings?.parentEmail) {
        alert('Please enter parent email first and save settings.');
        return;
      }
      
      if (!settings.emailjsConfig?.serviceId) {
        showEmailJSSetup();
        return;
      }
      
      const btn = document.getElementById('testEmail');
      btn.textContent = 'Sending...';
      btn.disabled = true;
      
      try {
        // Use the background script's email service
        const response = await chrome.runtime.sendMessage({
          action: 'sendTestEmail',
          parentEmail: settings.settings.parentEmail
        });
        
        if (response.success) {
          alert('✅ Test email sent successfully! Check your inbox.');
        } else {
          alert(`❌ Failed to send email: ${response.error}`);
        }
      } catch (error) {
        console.error('Error sending test email:', error);
        alert('❌ Error sending test email. Check console for details.');
      }
      
      btn.textContent = 'Test Email Report';
      btn.disabled = false;
    } catch (error) {
      console.error('Error in testEmail:', error);
      alert('Error sending test email.');
    }
  }
  
  function showEmailJSSetup() {
    const setupInstructions = `
📧 EMAIL SETUP REQUIRED

To send real emails, you need to set up EmailJS (free):

1. Go to https://www.emailjs.com
2. Create a free account
3. Add an email service (Gmail recommended)
4. Create an email template
5. Get your credentials and add them below

Need help? Check the README for detailed setup instructions.
    `;
    
    alert(setupInstructions);
    
    // Prompt for EmailJS credentials
    const serviceId = prompt('Enter your EmailJS Service ID:');
    if (!serviceId) return;
    
    const templateId = prompt('Enter your EmailJS Template ID:');
    if (!templateId) return;
    
    const publicKey = prompt('Enter your EmailJS Public Key:');
    if (!publicKey) return;
    
    // Save EmailJS config
    chrome.storage.local.set({
      emailjsConfig: {
        serviceId: serviceId.trim(),
        templateId: templateId.trim(),
        publicKey: publicKey.trim()
      }
    }).then(() => {
      alert('✅ EmailJS configuration saved! You can now test sending emails.');
    });
  }
  
  async function viewReports() {
    try {
      // Get recent reports
      const storage = await chrome.storage.local.get();
      const reports = Object.entries(storage)
        .filter(([key]) => key.startsWith('report_'))
        .map(([key, value]) => ({ date: key.replace('report_', ''), ...value }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7); // Last 7 days
      
      if (reports.length === 0) {
        alert('No reports available yet. Reports are generated daily at 6 PM.');
        return;
      }
      
      let reportText = '📊 Recent Reports:\n\n';
      reports.forEach(report => {
        reportText += `📅 ${report.date}\n`;
        reportText += `⏱️ Total: ${report.totalTimeMinutes} min\n`;
        reportText += `🌐 Sites: ${report.sites.length}\n`;
        if (report.emailSent === true) {
          reportText += `📧 Email: ✅ Sent\n`;
        } else if (report.emailSent === false) {
          reportText += `📧 Email: ❌ Failed\n`;
        } else {
          reportText += `📧 Email: ⏳ Not configured\n`;
        }
        if (report.topSites.length > 0) {
          reportText += `🔝 Top: ${report.topSites[0].domain} (${report.topSites[0].timeMinutes}m)\n`;
        }
        reportText += '\n';
      });
      
      alert(reportText);
    } catch (error) {
      console.error('Error viewing reports:', error);
      alert('Error loading reports.');
    }
  }

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendTestEmail') {
    // This will be handled by the background script
    return true;
  }
});