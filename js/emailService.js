// EmailJS service for sending daily reports
// Users need to configure their EmailJS credentials in the extension settings

class EmailService {
  constructor() {
    this.isInitialized = false;
    this.emailjsConfig = null;
  }

  async initialize() {
    try {
      // Get EmailJS configuration from storage
      const data = await chrome.storage.local.get('emailjsConfig');
      this.emailjsConfig = data.emailjsConfig;
      
      if (this.emailjsConfig && this.emailjsConfig.serviceId && this.emailjsConfig.templateId && this.emailjsConfig.publicKey) {
        this.isInitialized = true;
        console.log('EmailJS service initialized');
        return true;
      } else {
        console.log('EmailJS not configured');
        return false;
      }
    } catch (error) {
      console.error('Error initializing EmailJS:', error);
      return false;
    }
  }

  async sendEmail(templateParams) {
    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('EmailJS not configured. Please set up EmailJS credentials in settings.');
      }
    }

    try {
      const response = await this.callEmailJS(templateParams);
      console.log('Email sent successfully:', response);
      return { success: true, response };
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  async callEmailJS(templateParams) {
    const url = 'https://api.emailjs.com/api/v1.0/email/send';
    
    const payload = {
      service_id: this.emailjsConfig.serviceId,
      template_id: this.emailjsConfig.templateId,
      user_id: this.emailjsConfig.publicKey,
      template_params: templateParams
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EmailJS API error: ${response.status} - ${errorText}`);
    }

    return response.text();
  }

  async sendDailyReport(report, parentEmail) {
    const templateParams = {
      to_email: parentEmail,
      to_name: 'Parent',
      subject: `KidsWatch Daily Report - ${report.date}`,
      report_date: report.date,
      total_time: `${report.totalTimeMinutes} minutes`,
      sites_count: report.sites.length,
      top_sites: this.formatTopSites(report.topSites),
      all_sites: this.formatAllSites(report.sites),
      message: this.generateReportMessage(report)
    };

    return await this.sendEmail(templateParams);
  }

  formatTopSites(topSites) {
    if (topSites.length === 0) return 'No sites visited';
    
    return topSites.map((site, index) => 
      `${index + 1}. ${site.domain} - ${site.timeMinutes} minutes (${site.visits} visits)`
    ).join('\n');
  }

  formatAllSites(sites) {
    if (sites.length === 0) return 'No sites visited';
    
    return sites.map(site => 
      `${site.domain}: ${site.timeMinutes}m (${site.visits}x)`
    ).join('\n');
  }

  generateReportMessage(report) {
    const totalHours = Math.floor(report.totalTimeMinutes / 60);
    const remainingMinutes = report.totalTimeMinutes % 60;
    
    let message = `Here's your child's browsing summary for ${report.date}:\n\n`;
    message += `📊 Total Screen Time: `;
    
    if (totalHours > 0) {
      message += `${totalHours} hour${totalHours > 1 ? 's' : ''}`;
      if (remainingMinutes > 0) {
        message += ` and ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
      }
    } else {
      message += `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    }
    
    message += `\n🌐 Websites Visited: ${report.sites.length}\n\n`;
    
    if (report.topSites.length > 0) {
      message += `🔝 Most Used Sites:\n`;
      report.topSites.slice(0, 3).forEach((site, index) => {
        message += `${index + 1}. ${site.domain} (${site.timeMinutes} minutes)\n`;
      });
    }
    
    message += `\n💡 This report was generated automatically by KidsWatch Chrome Extension.`;
    
    return message;
  }

  async testEmail(parentEmail) {
    const testReport = {
      date: new Date().toISOString().split('T')[0],
      totalTimeMinutes: 45,
      sites: [
        { domain: 'khanacademy.org', timeMinutes: 20, visits: 3 },
        { domain: 'scratch.mit.edu', timeMinutes: 15, visits: 2 },
        { domain: 'docs.google.com', timeMinutes: 10, visits: 1 }
      ],
      topSites: [
        { domain: 'khanacademy.org', timeMinutes: 20, visits: 3 },
        { domain: 'scratch.mit.edu', timeMinutes: 15, visits: 2 },
        { domain: 'docs.google.com', timeMinutes: 10, visits: 1 }
      ]
    };

    return await this.sendDailyReport(testReport, parentEmail);
  }
}

// Create singleton instance
const emailService = new EmailService();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailService;
} 