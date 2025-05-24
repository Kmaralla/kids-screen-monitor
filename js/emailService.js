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
      
      console.log('EmailJS config from storage:', this.emailjsConfig ? 'Found' : 'Not found');
      
      if (this.emailjsConfig && this.emailjsConfig.serviceId && this.emailjsConfig.templateId && this.emailjsConfig.publicKey) {
        this.isInitialized = true;
        console.log('EmailJS service initialized successfully');
        console.log('Service ID:', this.emailjsConfig.serviceId);
        console.log('Template ID:', this.emailjsConfig.templateId);
        console.log('Public Key:', this.emailjsConfig.publicKey.substring(0, 8) + '...');
        return true;
      } else {
        console.log('EmailJS not configured - missing required fields');
        console.log('Has serviceId:', !!this.emailjsConfig?.serviceId);
        console.log('Has templateId:', !!this.emailjsConfig?.templateId);
        console.log('Has publicKey:', !!this.emailjsConfig?.publicKey);
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
      console.log('Sending email with template params:', Object.keys(templateParams));
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

    console.log('Making request to EmailJS API...');
    console.log('URL:', url);
    console.log('Payload structure:', {
      service_id: payload.service_id,
      template_id: payload.template_id,
      user_id: payload.user_id.substring(0, 8) + '...',
      template_params_keys: Object.keys(payload.template_params)
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    console.log('EmailJS API response status:', response.status);
    console.log('EmailJS API response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('EmailJS API error response:', errorText);
      
      // Try to parse error details
      let errorMessage = `EmailJS API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage += ` - ${errorJson.message}`;
        }
        if (errorJson.error) {
          errorMessage += ` - ${errorJson.error}`;
        }
      } catch (parseError) {
        errorMessage += ` - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const responseText = await response.text();
    console.log('EmailJS API success response:', responseText);
    return responseText;
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
    // Validate configuration first
    const validationResult = await this.validateConfiguration();
    if (!validationResult.isValid) {
      throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
    }

    console.log('EmailJS configuration validated successfully');

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

  async validateConfiguration() {
    const errors = [];
    let config = null;

    try {
      const data = await chrome.storage.local.get('emailjsConfig');
      config = data.emailjsConfig;
    } catch (error) {
      errors.push('Failed to read configuration from storage');
      return { isValid: false, errors };
    }

    if (!config) {
      errors.push('No EmailJS configuration found');
      return { isValid: false, errors };
    }

    // Validate required fields
    if (!config.serviceId || config.serviceId.trim() === '') {
      errors.push('Service ID is missing or empty');
    }

    if (!config.templateId || config.templateId.trim() === '') {
      errors.push('Template ID is missing or empty');
    }

    if (!config.publicKey || config.publicKey.trim() === '') {
      errors.push('Public Key is missing or empty');
    }

    // Validate format (basic checks)
    if (config.serviceId && !config.serviceId.match(/^service_[a-zA-Z0-9]+$/)) {
      errors.push('Service ID format appears incorrect (should start with "service_")');
    }

    if (config.templateId && !config.templateId.match(/^template_[a-zA-Z0-9]+$/)) {
      errors.push('Template ID format appears incorrect (should start with "template_")');
    }

    if (config.publicKey && config.publicKey.length < 10) {
      errors.push('Public Key appears too short');
    }

    return {
      isValid: errors.length === 0,
      errors,
      config: config ? {
        serviceId: config.serviceId,
        templateId: config.templateId,
        publicKeyLength: config.publicKey?.length || 0
      } : null
    };
  }
}

// Create singleton instance
const emailService = new EmailService();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailService;
} 