// Popup script for KidsWatch extension

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadTodayStats();
    
    // Event listeners
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('testEmail').addEventListener('click', testEmail);
    document.getElementById('viewReports').addEventListener('click', viewReports);
    document.getElementById('debugEmail').addEventListener('click', debugEmailJS);
    document.getElementById('resetEmail').addEventListener('click', async () => {
      if (confirm('⚠️ Are you sure you want to reset your EmailJS configuration? You will need to set it up again.')) {
        await resetEmailJSConfig();
        showEmailJSSetup();
      }
    });
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
    const btn = document.getElementById('testEmail');
    const originalText = btn.textContent;
    
    try {
      const settings = await chrome.storage.local.get(['settings', 'emailjsConfig']);
      
      if (!settings.settings?.parentEmail) {
        alert('❌ Please enter parent email first and save settings.');
        return;
      }
      
      if (!settings.emailjsConfig?.serviceId) {
        console.log('No EmailJS configuration found, showing setup dialog');
        showEmailJSSetup();
        return;
      }

      // Validate EmailJS configuration
      console.log('Validating EmailJS configuration...');
      const config = settings.emailjsConfig;
      const validationErrors = [];
      
      if (!config.serviceId || !config.serviceId.trim()) {
        validationErrors.push('Service ID is missing');
      }
      if (!config.templateId || !config.templateId.trim()) {
        validationErrors.push('Template ID is missing');
      }
      if (!config.publicKey || !config.publicKey.trim()) {
        validationErrors.push('Public Key is missing');
      }
      
      if (validationErrors.length > 0) {
        console.error('EmailJS configuration validation failed:', validationErrors);
        alert(`❌ EmailJS configuration incomplete:\n${validationErrors.join('\n')}\n\nPlease reconfigure EmailJS.`);
        showEmailJSSetup();
        return;
      }

      console.log('EmailJS configuration looks valid, proceeding with test email...');
      
      btn.textContent = 'Sending...';
      btn.disabled = true;
      
      try {
        console.log('Sending test email to:', settings.settings.parentEmail);
        
        // Check if service worker is available
        if (!chrome.runtime) {
          throw new Error('Chrome runtime not available. Please reload the extension.');
        }
        
        // Use the background script's email service
        const response = await chrome.runtime.sendMessage({
          action: 'sendTestEmail',
          parentEmail: settings.settings.parentEmail
        });
        
        console.log('Test email response:', response);
        
        if (response && response.success) {
          alert('✅ Test email sent successfully! Check your inbox (and spam folder).');
          console.log('Test email sent successfully');
        } else {
          const errorMsg = response?.error || 'Unknown error occurred';
          console.error('Test email failed:', errorMsg);
          
          // Provide more specific error guidance
          let userMessage = `❌ Failed to send email: ${errorMsg}\n\n`;
          
          if (errorMsg.includes('400')) {
            userMessage += '💡 This might be a configuration issue. Please check:\n';
            userMessage += '• Your EmailJS Service ID is correct\n';
            userMessage += '• Your EmailJS Template ID is correct\n';
            userMessage += '• Your EmailJS Public Key is correct\n';
            userMessage += '• Your email template includes the required variables';
          } else if (errorMsg.includes('403') || errorMsg.includes('401')) {
            userMessage += '💡 This looks like an authentication issue:\n';
            userMessage += '• Check your EmailJS Public Key\n';
            userMessage += '• Verify your EmailJS account is active\n';
            userMessage += '• Make sure you haven\'t exceeded the free tier limits';
          } else if (errorMsg.includes('404')) {
            userMessage += '💡 This looks like a configuration issue:\n';
            userMessage += '• Check your Service ID is correct\n';
            userMessage += '• Check your Template ID is correct\n';
            userMessage += '• Make sure the service and template exist in your EmailJS account';
          } else {
            userMessage += '💡 Try the following:\n';
            userMessage += '• Check your internet connection\n';
            userMessage += '• Verify your EmailJS account at emailjs.com\n';
            userMessage += '• Check the browser console for more details';
          }
          
          alert(userMessage);
        }
      } catch (error) {
        console.error('Error sending test email:', error);
        
        let errorMessage = '❌ Error sending test email:\n';
        
        if (error.message && error.message.includes('Could not establish connection')) {
          errorMessage += 'Service worker connection failed.\n\n';
          errorMessage += '🔄 SOLUTION:\n';
          errorMessage += '1. Go to chrome://extensions/\n';
          errorMessage += '2. Find "KidsWatch - Parental Control"\n';
          errorMessage += '3. Click the reload button (🔄)\n';
          errorMessage += '4. Try the test email again\n\n';
          errorMessage += 'This restarts the service worker and fixes communication issues.';
        } else {
          errorMessage += error.message || 'Unknown error';
          errorMessage += '\n\n💡 Check the browser console (F12) for more details.';
        }
        
        alert(errorMessage);
      }
      
    } catch (error) {
      console.error('Error in testEmail function:', error);
      alert('❌ Unexpected error occurred. Check the browser console for details.');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
  
  function showEmailJSSetup() {
    const setupInstructions = `
📧 EMAILJS SETUP REQUIRED

To send email reports, set up EmailJS (free - 200 emails/month):

🔗 QUICK SETUP STEPS:
1. Go to https://www.emailjs.com and create account
2. Add Email Service (Gmail recommended)
3. Create Email Template with these variables:
   • {{to_email}} {{to_name}} {{subject}}
   • {{report_date}} {{total_time}} {{sites_count}}
   • {{top_sites}} {{all_sites}} {{message}}
4. Get your 3 IDs below

💡 Need detailed help? Check the README file!
    `;
    
    alert(setupInstructions);
    
    // Prompt for EmailJS credentials with validation
    const serviceId = prompt('Enter your EmailJS Service ID (starts with "service_"):');
    if (!serviceId) return;
    
    if (!serviceId.startsWith('service_')) {
      alert('⚠️ Service ID should start with "service_". Please check your EmailJS dashboard.');
      return;
    }
    
    const templateId = prompt('Enter your EmailJS Template ID (starts with "template_"):');
    if (!templateId) return;
    
    if (!templateId.startsWith('template_')) {
      alert('⚠️ Template ID should start with "template_". Please check your EmailJS dashboard.');
      return;
    }
    
    const publicKey = prompt('Enter your EmailJS Public Key (from Account section):');
    if (!publicKey) return;
    
    if (publicKey.length < 10) {
      alert('⚠️ Public Key seems too short. Please check your EmailJS account section.');
      return;
    }
    
    // Save EmailJS config
    console.log('Saving EmailJS configuration...');
    chrome.storage.local.set({
      emailjsConfig: {
        serviceId: serviceId.trim(),
        templateId: templateId.trim(),
        publicKey: publicKey.trim()
      }
    }).then(() => {
      alert('✅ EmailJS configuration saved!\n\nNow click "Test Email Report" to verify it works.');
      console.log('EmailJS configuration saved successfully');
    }).catch(error => {
      console.error('Error saving EmailJS config:', error);
      alert('❌ Error saving configuration. Please try again.');
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
  
  async function debugEmailJS() {
    try {
      console.log('=== EmailJS Debug Information ===');
      
      // Check storage
      const data = await chrome.storage.local.get(['emailjsConfig', 'settings']);
      const config = data.emailjsConfig;
      const settings = data.settings;
      
      console.log('Storage data found:', {
        hasEmailjsConfig: !!config,
        hasSettings: !!settings,
        hasParentEmail: !!settings?.parentEmail
      });
      
      if (!config) {
        console.log('❌ No EmailJS configuration found in storage');
        alert('❌ No EmailJS configuration found. Please set up EmailJS first.');
        showEmailJSSetup();
        return;
      }
      
      console.log('EmailJS Configuration:', {
        serviceId: config.serviceId || 'MISSING',
        templateId: config.templateId || 'MISSING', 
        publicKeyLength: config.publicKey ? config.publicKey.length : 0,
        publicKeyPreview: config.publicKey ? config.publicKey.substring(0, 8) + '...' : 'MISSING'
      });
      
      // Test API connectivity
      console.log('Testing EmailJS API connectivity...');
      try {
        const testResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service_id: 'test',
            template_id: 'test',
            user_id: 'test'
          })
        });
        
        console.log('API test response status:', testResponse.status);
        console.log('API is reachable');
        
        if (testResponse.status === 400) {
          console.log('✅ API is working (400 expected for invalid test data)');
        }
        
      } catch (apiError) {
        console.error('❌ API connectivity test failed:', apiError);
      }
      
      // Validate configuration format
      const issues = [];
      if (!config.serviceId || !config.serviceId.startsWith('service_')) {
        issues.push('Service ID format issue (should start with "service_")');
      }
      if (!config.templateId || !config.templateId.startsWith('template_')) {
        issues.push('Template ID format issue (should start with "template_")');
      }
      if (!config.publicKey || config.publicKey.length < 10) {
        issues.push('Public Key seems invalid (too short)');
      }
      if (!settings?.parentEmail) {
        issues.push('Parent email not configured');
      }
      
      console.log('Configuration issues found:', issues);
      
      let debugMessage = '🔍 EmailJS Debug Results:\n\n';
      
      if (issues.length === 0) {
        debugMessage += '✅ Configuration looks good!\n\n';
        debugMessage += `Service ID: ${config.serviceId}\n`;
        debugMessage += `Template ID: ${config.templateId}\n`;
        debugMessage += `Public Key: ${config.publicKey.substring(0, 8)}...\n`;
        debugMessage += `Parent Email: ${settings.parentEmail}\n\n`;
        debugMessage += 'If test email still fails, check:\n';
        debugMessage += '• EmailJS account limits\n';
        debugMessage += '• Email template variables\n';
        debugMessage += '• Service connection in EmailJS dashboard';
      } else {
        debugMessage += '❌ Issues found:\n';
        issues.forEach(issue => {
          debugMessage += `• ${issue}\n`;
        });
        debugMessage += '\nPlease fix these issues and try again.';
        
        // Offer to reconfigure if there are issues
        if (confirm('Would you like to reconfigure EmailJS now?')) {
          await resetEmailJSConfig();
          showEmailJSSetup();
          return;
        }
      }
      
      console.log('=== End Debug Information ===');
      alert(debugMessage);
      
    } catch (error) {
      console.error('Error in debugEmailJS:', error);
      alert('❌ Debug function failed. Check console for details.');
    }
  }

  async function resetEmailJSConfig() {
    try {
      await chrome.storage.local.remove('emailjsConfig');
      console.log('EmailJS configuration cleared');
      alert('✅ EmailJS configuration cleared. You can now set it up again.');
    } catch (error) {
      console.error('Error clearing EmailJS config:', error);
      alert('❌ Error clearing configuration.');
    }
  }

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendTestEmail') {
    // This will be handled by the background script
    return true;
  }
});