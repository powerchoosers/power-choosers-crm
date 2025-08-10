// Power Choosers CRM Dashboard - Gmail Integration Module
// Handles OAuth (GIS) and Gmail API requests for Inbox/Sent/Drafts and sending messages.

(function () {
  const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
  ].join(' ');

  const GmailModule = {
    _config: null,
    _gapiLoaded: false,
    _gisLoaded: false,
    _tokenClient: null,
    _initTried: false,

    async init() {
      try {
        await this._loadScripts();
        this._config = await this._loadConfig();
        await this._initGapiClient();
        this._initTokenClient();
        this._initTried = true;
        console.log('GmailModule initialized');
      } catch (err) {
        console.error('GmailModule init failed:', err);
        if (window.CRMApp && CRMApp.showToast) {
          CRMApp.showToast('Failed to initialize Gmail. Check console and GMAIL API.json', 'error');
        }
      }
    },

    async _loadScripts() {
      // Load gapi
      if (!this._gapiLoaded) {
        await this._injectScript('https://apis.google.com/js/api.js');
        this._gapiLoaded = true;
      }
      // Load Google Identity Services (GIS)
      if (!this._gisLoaded) {
        await this._injectScript('https://accounts.google.com/gsi/client');
        this._gisLoaded = true;
      }
    },

    _injectScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load script: ' + src));
        document.head.appendChild(s);
      });
    },

    async _loadConfig() {
      // Normalize helper
      const pickConfig = (json) => {
        if (!json) return null;
        const clientId = json.client_id || json.web?.client_id;
        const apiKey = json.api_key || json.web?.api_key || null;
        if (json.web?.client_secret) {
          console.warn('Gmail config contains client_secret. Do not expose secrets in frontend; it will be ignored.');
        }
        return clientId ? { client_id: clientId, api_key: apiKey } : null;
      };

      // Try global variable
      if (window.GMAIL_CONFIG) {
        const cfg = pickConfig(window.GMAIL_CONFIG);
        if (cfg) return cfg;
      }

      // Try embedded script tag
      const tag = document.getElementById('gmail-config');
      if (tag && tag.textContent) {
        try {
          const json = JSON.parse(tag.textContent);
          const cfg = pickConfig(json);
          if (cfg) return cfg;
        } catch {}
      }

      // Try multiple file paths
      const candidates = [
        'GMAIL API.json', './GMAIL API.json', '/GMAIL API.json',
        'GMAIL_API.json', './GMAIL_API.json', '/GMAIL_API.json',
        'gmail-api.json', './gmail-api.json', '/gmail-api.json',
        'config/gmail.json', './config/gmail.json', '/config/gmail.json'
      ];
      for (const url of candidates) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            const cfg = pickConfig(json);
            if (cfg) return cfg;
          }
        } catch {}
      }
      throw new Error('Cannot load Gmail config. Provide window.GMAIL_CONFIG or a config file like "GMAIL API.json" at site root with client_id.');
    },

    async _initGapiClient() {
      await new Promise((resolve) => window.gapi.load('client', resolve));
      const initObj = { discoveryDocs: [DISCOVERY_DOC] };
      if (this._config.api_key) initObj.apiKey = this._config.api_key;
      await window.gapi.client.init(initObj);
    },

    _initTokenClient() {
      this._tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this._config.client_id,
        scope: SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            window.gapi.client.setToken({ access_token: tokenResponse.access_token });
            if (window.CRMApp && CRMApp.showToast) CRMApp.showToast('Gmail connected', 'success');
          }
        }
      });
    },

    isSignedIn() {
      const token = window.gapi?.client?.getToken?.();
      return !!(token && token.access_token);
    },

    async signIn() {
      // Ensure everything is ready even if init() failed earlier
      await this.ensureInitialized();
      if (!this._tokenClient) throw new Error('Token client not initialized');
      this._tokenClient.requestAccessToken({ prompt: this.isSignedIn() ? '' : 'consent' });
    },

    signOut() {
      try {
        const token = window.gapi?.client?.getToken?.();
        if (token && token.access_token) {
          window.google.accounts.oauth2.revoke(token.access_token);
        }
        if (window.gapi?.client?.setToken) window.gapi.client.setToken('');
      } catch (e) {
        console.warn('Error during Gmail signOut:', e);
      }
    },

    async ensureInitialized() {
      if (this._tokenClient && window.gapi?.client) return; // already ready
      try {
        if (!this._gapiLoaded || !this._gisLoaded) await this._loadScripts();
        if (!this._config) this._config = await this._loadConfig();
        if (!window.gapi?.client) await this._initGapiClient();
        if (!this._tokenClient) this._initTokenClient();
        this._initTried = true;
      } catch (e) {
        console.error('ensureInitialized failed:', e);
        throw e;
      }
    },

    async listMessages({ labelIds = ['INBOX'], maxResults = 20, q = '' } = {}) {
      if (!this.isSignedIn()) throw new Error('Not signed in to Gmail');
      const listRes = await window.gapi.client.gmail.users.messages.list({
        userId: 'me', labelIds, maxResults, q
      });
      const messages = listRes.result.messages || [];
      if (!messages.length) return [];
      // Fetch details for each message
      const details = await Promise.all(messages.map(m => this.getMessage(m.id)));
      return details;
    },

    async listDrafts({ maxResults = 20 } = {}) {
      if (!this.isSignedIn()) throw new Error('Not signed in to Gmail');
      const listRes = await window.gapi.client.gmail.users.drafts.list({ userId: 'me', maxResults });
      const drafts = listRes.result.drafts || [];
      if (!drafts.length) return [];
      const details = await Promise.all(drafts.map(async (d) => {
        const res = await window.gapi.client.gmail.users.drafts.get({ userId: 'me', id: d.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Date'] });
        const msg = res.result.message;
        const headers = (msg.payload?.headers || []).reduce((acc, h) => { acc[h.name.toLowerCase()] = h.value; return acc; }, {});
        return {
          id: msg.id,
          draftId: d.id,
          subject: headers['subject'] || '(No subject)',
          from: headers['from'] || '',
          to: headers['to'] || '',
          date: headers['date'] || '',
          snippet: msg.snippet || '',
          internalDate: msg.internalDate ? new Date(parseInt(msg.internalDate, 10)) : null,
          labelIds: (msg.labelIds || []).concat(['DRAFT'])
        };
      }));
      return details;
    },

    async getMessage(id) {
      const res = await window.gapi.client.gmail.users.messages.get({
        userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Date']
      });
      const msg = res.result;
      const headers = (msg.payload?.headers || []).reduce((acc, h) => { acc[h.name.toLowerCase()] = h.value; return acc; }, {});
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: headers['subject'] || '(No subject)',
        from: headers['from'] || '',
        to: headers['to'] || '',
        date: headers['date'] || '',
        snippet: msg.snippet || '',
        internalDate: msg.internalDate ? new Date(parseInt(msg.internalDate, 10)) : null,
        labelIds: msg.labelIds || []
      };
    },

    async sendMessage({ to, cc = '', subject = '', bodyHtml = '', bodyText = '' }) {
      if (!this.isSignedIn()) throw new Error('Not signed in to Gmail');
      // Build simple MIME
      const boundary = 'foo_bar_baz_' + Date.now();
      const nl = '\r\n';
      const headers = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : null,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`
      ].filter(Boolean).join(nl);

      const textPart = [
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, '') : ''),
        ''
      ].join(nl);

      const htmlPart = [
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        '',
        bodyHtml || (bodyText ? `<pre>${this._escapeHtml(bodyText)}</pre>` : ''),
        ''
      ].join(nl);

      const closing = [`--${boundary}--`, ''].join(nl);
      const mime = [headers, '', textPart, htmlPart, closing].join(nl);
      const raw = this._base64UrlEncode(mime);

      const res = await window.gapi.client.gmail.users.messages.send({ userId: 'me', resource: { raw } });
      return res.result;
    },

    _base64UrlEncode(str) {
      // btoa on UTF-8
      const utf8 = unescape(encodeURIComponent(str));
      return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    _escapeHtml(s) {
      return (s || '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
  };

  window.GmailModule = GmailModule;
})();
