// Content script for KidsWatch extension
// Runs on all pages to provide timeout warnings

let warningShown = false;
let timeoutTimer = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'showWarning') {
    showTimeoutWarning(message.remainingSeconds);
  } else if (message.type === 'hideWarning') {
    hideTimeoutWarning();
  }
});

function showTimeoutWarning(remainingSeconds) {
  if (warningShown) return;
  
  warningShown = true;
  
  // Create warning overlay
  const overlay = document.createElement('div');
  overlay.id = 'kidswatch-warning';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  const warningBox = document.createElement('div');
  warningBox.style.cssText = `
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
    color: white;
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    max-width: 400px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    animation: bounce 0.5s ease-out;
  `;
  
  // Add bounce animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bounce {
      0% { transform: scale(0.8) translateY(-100px); opacity: 0; }
      60% { transform: scale(1.1) translateY(0); opacity: 1; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  warningBox.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">⏰</div>
    <h2 style="margin: 0 0 15px 0; font-size: 24px;">Time Almost Up!</h2>
    <p style="margin: 0 0 20px 0; font-size: 18px; opacity: 0.9;">
      You have <strong id="countdown">${remainingSeconds}</strong> seconds left on this site.
    </p>
    <p style="margin: 0; font-size: 14px; opacity: 0.7;">
      Save your work and get ready to take a break! 🌟
    </p>
  `;
  
  overlay.appendChild(warningBox);
  document.body.appendChild(overlay);
  
  // Start countdown
  const countdownElement = warningBox.querySelector('#countdown');
  let remaining = remainingSeconds;
  
  timeoutTimer = setInterval(() => {
    remaining--;
    countdownElement.textContent = remaining;
    
    if (remaining <= 0) {
      clearInterval(timeoutTimer);
      // The background script will handle the redirect
    }
  }, 1000);
  
  // Auto-hide after showing for a few seconds (unless it's the final warning)
  if (remainingSeconds > 10) {
    setTimeout(() => {
      hideTimeoutWarning();
    }, 3000);
  }
}

function hideTimeoutWarning() {
  const existing = document.getElementById('kidswatch-warning');
  if (existing) {
    existing.remove();
    warningShown = false;
  }
  
  if (timeoutTimer) {
    clearInterval(timeoutTimer);
    timeoutTimer = null;
  }
}

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
  hideTimeoutWarning();
});