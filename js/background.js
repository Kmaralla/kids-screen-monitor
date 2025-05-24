// Background service worker for KidsWatch extension
// Import EmailJS service
importScripts('emailService.js');

let activeTab = null;
let startTime = null;
let timeoutAlarm = null;

// Default settings
const DEFAULT_SETTINGS = {
  timeoutMinutes: 5,
  allowlist: [
    'classroom.google.com',
    'docs.google.com',
    'drive.google.com',
    'gmail.com',
    'khanacademy.org',
    'duolingo.com',
    'scratch.mit.edu'
  ],
  parentEmail: '',
  isEnabled: true
};

// Message listener for popup communications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendTestEmail') {
    handleTestEmailRequest(message.parentEmail)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

async function handleTestEmailRequest(parentEmail) {
  try {
    await emailService.testEmail(parentEmail);
    return { success: true, message: 'Test email sent successfully' };
  } catch (error) {
    console.error('Test email failed:', error);
    return { success: false, error: error.message };
  }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('KidsWatch extension installed');
  
  // Set default settings if not exists
  const settings = await chrome.storage.local.get('settings');
  if (!settings.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  
  // Set up daily report alarm
  chrome.alarms.create('dailyReport', {
    when: getNextReportTime(),
    periodInMinutes: 24 * 60 // 24 hours
  });
});

// Track active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await handleTabChange(activeInfo.tabId);
});

// Track tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await handleTabChange(tabId);
  }
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Lost focus - stop tracking
    await stopTracking();
  } else {
    // Gained focus - start tracking active tab
    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tabs[0]) {
      await handleTabChange(tabs[0].id);
    }
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyReport') {
    await sendDailyReport();
  } else if (alarm.name === 'timeout') {
    await handleTimeout();
  }
});

async function handleTabChange(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    // Stop previous tracking
    await stopTracking();
    
    // Start new tracking
    activeTab = { tabId, domain, url: tab.url };
    startTime = Date.now();
    
    // Check if site is allowed
    const settings = await getSettings();
    if (!isAllowedSite(domain, settings.allowlist) && settings.isEnabled) {
      // Start timeout for non-allowed sites
      chrome.alarms.create('timeout', {
        delayInMinutes: settings.timeoutMinutes
      });
    }
    
    console.log(`Started tracking: ${domain}`);
  } catch (error) {
    console.error('Error handling tab change:', error);
  }
}

async function stopTracking() {
  if (activeTab && startTime) {
    const timeSpent = Date.now() - startTime;
    await recordTimeSpent(activeTab.domain, timeSpent);
    
    // Clear timeout alarm
    chrome.alarms.clear('timeout');
    
    console.log(`Stopped tracking: ${activeTab.domain}, Time: ${Math.round(timeSpent/1000)}s`);
  }
  
  activeTab = null;
  startTime = null;
}

async function recordTimeSpent(domain, timeMs) {
  const today = new Date().toISOString().split('T')[0];
  const data = await chrome.storage.local.get(`usage_${today}`);
  const todayData = data[`usage_${today}`] || {};
  
  if (!todayData[domain]) {
    todayData[domain] = { time: 0, visits: 0 };
  }
  
  todayData[domain].time += timeMs;
  todayData[domain].visits += 1;
  
  await chrome.storage.local.set({ [`usage_${today}`]: todayData });
}

async function handleTimeout() {
  if (activeTab) {
    // Redirect to timeout page
    chrome.tabs.update(activeTab.tabId, {
      url: chrome.runtime.getURL('html/timeout.html')
    });
  }
}

function isAllowedSite(domain, allowlist) {
  return allowlist.some(allowed => 
    domain === allowed || domain.endsWith('.' + allowed)
  );
}

async function getSettings() {
  const data = await chrome.storage.local.get('settings');
  return data.settings || DEFAULT_SETTINGS;
}

async function sendDailyReport() {
  try {
    const settings = await getSettings();
    if (!settings.parentEmail) {
      console.log('No parent email configured, skipping daily report');
      return;
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const data = await chrome.storage.local.get(`usage_${dateStr}`);
    const usageData = data[`usage_${dateStr}`] || {};
    
    const report = generateReport(usageData, dateStr);
    
    // Try to send email using EmailJS
    try {
      await emailService.sendDailyReport(report, settings.parentEmail);
      console.log('Daily report email sent successfully');
      
      // Store success record
      await chrome.storage.local.set({
        [`report_${dateStr}`]: { ...report, emailSent: true, sentAt: new Date().toISOString() },
        lastReportDate: dateStr
      });
    } catch (emailError) {
      console.error('Failed to send email report:', emailError);
      
      // Store failed attempt but keep the report
      await chrome.storage.local.set({
        [`report_${dateStr}`]: { ...report, emailSent: false, error: emailError.message },
        lastReportDate: dateStr
      });
    }
  } catch (error) {
    console.error('Error generating daily report:', error);
  }
}

function generateReport(usageData, date) {
  const sites = Object.entries(usageData)
    .map(([domain, data]) => ({
      domain,
      timeMinutes: Math.round(data.time / (1000 * 60)),
      visits: data.visits
    }))
    .sort((a, b) => b.timeMinutes - a.timeMinutes);
  
  const totalTime = sites.reduce((sum, site) => sum + site.timeMinutes, 0);
  
  return {
    date,
    totalTimeMinutes: totalTime,
    sites,
    topSites: sites.slice(0, 5)
  };
}

function getNextReportTime() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0); // 6 PM daily
  return tomorrow.getTime();
}