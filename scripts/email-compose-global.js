/**
 * Global Email Compose Module
 * 
 * Provides email compose functionality globally, allowing any page
 * to open the email composer without requiring the emails page to be loaded.
 * 
 * Usage: window.EmailCompose.openTo('email@example.com', 'Contact Name')
 */

(function() {
  if (!window.EmailCompose) window.EmailCompose = {};
  
  window.EmailCompose.openTo = function(toEmail, name = '') {
    try {
      toEmail = String(toEmail || '').trim();
    } catch(_) {
      toEmail = '';
    }
    
    if (!toEmail || !/@/.test(toEmail)) {
      window.crm?.showToast && window.crm.showToast('No valid email found');
      return;
    }
    
    console.log('[EmailCompose] Opening compose for:', toEmail, name || '');
    
    // Always try to open compose window directly on current page
    // No navigation - stay on whatever page user is currently on
    openComposeWindowDirect(toEmail, name);
  };
  
  function openComposeWindowDirect(toEmail, name) {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) {
      console.warn('[EmailCompose] Compose window not found in DOM');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
      return;
    }
    
    // Try emails-redesigned.js first, but fallback to direct DOM manipulation
    if (window.emailManager && typeof window.emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Using emails-redesigned.js compose function...');
      openComposeWithManager(toEmail, name);
    } else {
      console.log('[EmailCompose] emailManager not available, using direct DOM approach...');
      openComposeDirectly(toEmail, name);
    }
  }
  
  function openComposeWithManager(toEmail, name) {
    const emailManager = window.emailManager;
    
    if (emailManager && typeof emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Opening compose with emails-redesigned.js...');
      // Call openComposeWindow with null to ensure it's treated as a new email
      emailManager.openComposeWindow(null);
      
      // Wait for compose window to be ready, then prefill
      setTimeout(() => {
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        
        console.log('[EmailCompose] Subject field value after opening:', subjectInput?.value);
        
        if (toInput) {
          toInput.value = toEmail;
        }
        
        // Ensure subject is empty for new emails
        if (subjectInput && subjectInput.value.includes('Re:')) {
          console.log('[EmailCompose] Clearing Re: prefix from subject');
          subjectInput.value = '';
          }
          
          // Focus the To input
          setTimeout(() => toInput.focus(), 100);
      }, 200);
    } else {
      console.warn('[EmailCompose] emailManager.openComposeWindow not available');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
    }
  }
  
  function openComposeDirectly(toEmail, name) {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) {
      console.warn('[EmailCompose] Compose window not found');
      return;
    }
    
    // Reset compose window fields
    const toInput = document.getElementById('compose-to');
    const subjectInput = document.getElementById('compose-subject');
    const ccInput = document.getElementById('compose-cc');
    const bccInput = document.getElementById('compose-bcc');
    const bodyInput = document.querySelector('.body-input');
    
    // Clear all fields
    if (toInput) toInput.value = '';
    if (subjectInput) subjectInput.value = '';
    if (ccInput) ccInput.value = '';
    if (bccInput) bccInput.value = '';
    if (bodyInput) bodyInput.innerHTML = '';
    
    // Show compose window
    composeWindow.style.display = 'flex';
    setTimeout(() => {
      composeWindow.classList.add('open');
    }, 10);
    
    // Prefill the To field
    setTimeout(() => {
      if (toInput) {
        toInput.value = toEmail;
        toInput.focus();
      }
    }, 100);
    
    // Setup close button functionality if not already set up
    setupComposeCloseButton();
    
    // Initialize AI bar if present
    const aiBar = composeWindow.querySelector('.ai-bar');
    if (aiBar && !aiBar.dataset.rendered) {
      setTimeout(() => {
        renderAIBar(aiBar);
      }, 200);
    }
    
    console.log('[EmailCompose] Opened compose window directly for:', toEmail);
  }
  
  function setupComposeCloseButton() {
    const closeBtn = document.getElementById('compose-close');
    const composeWindow = document.getElementById('compose-window');
    
    if (closeBtn && !closeBtn.dataset.listenerAdded) {
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Close compose window
        if (composeWindow) {
          composeWindow.classList.remove('open');
          setTimeout(() => {
            composeWindow.style.display = 'none';
          }, 300);
        }
        
        console.log('[EmailCompose] Compose window closed');
      });
      
      closeBtn.dataset.listenerAdded = 'true';
    }
  }
  
  // ========== AI GENERATION ANIMATION FUNCTIONS ==========
  
  function startGeneratingAnimation(composeWindow) {
    const overlay = document.getElementById('compose-generating-overlay');
    const subjectInput = composeWindow?.querySelector('#compose-subject');
    const bodyInput = composeWindow?.querySelector('.body-input');
    
    if (!overlay) return;
    
    // Show skeleton overlay
    overlay.style.display = 'flex';
    
    // Add glow effect only to subject and body inputs (not entire window)
    if (subjectInput) {
      subjectInput.classList.add('compose-input-transition', 'generating', 'compose-generating');
    }
    if (bodyInput) {
      bodyInput.classList.add('compose-input-transition', 'generating', 'compose-generating');
    }
    
    // Animate skeleton bars with staggered delays
    animateSkeletonBars();
    
    console.log('[AI Animation] Started generating animation');
  }
  
  function stopGeneratingAnimation(composeWindow) {
    const overlay = document.getElementById('compose-generating-overlay');
    const subjectInput = composeWindow?.querySelector('#compose-subject');
    const bodyInput = composeWindow?.querySelector('.body-input');
    
    if (!overlay) return;
    
    // Hide skeleton overlay
    overlay.style.display = 'none';
    
    // Remove glow effect from specific inputs
    if (subjectInput) {
      subjectInput.classList.remove('compose-input-transition', 'generating', 'compose-generating');
    }
    if (bodyInput) {
      bodyInput.classList.remove('compose-input-transition', 'generating', 'compose-generating');
    }
    
    console.log('[AI Animation] Stopped generating animation');
  }
  
  function animateSkeletonBars() {
    const bars = document.querySelectorAll('.ai-skeleton');
    bars.forEach((bar, index) => {
      bar.style.animationDelay = `${index * 0.2}s`;
    });
  }
  
  function typewriterEffect(element, text, speed = 30) {
    if (!element || !text) return;
    
    // Handle both input fields and contentEditable elements
    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
    
    if (isInput) {
      // For input fields, use value property
      element.value = '';
      element.style.borderRight = '2px solid var(--orange-primary)';
      
      let i = 0;
      const timer = setInterval(() => {
        if (i < text.length) {
          element.value += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          element.style.borderRight = 'none';
        }
      }, speed);
    } else {
      // For contentEditable elements, use innerHTML
      element.innerHTML = '';
      element.style.borderRight = '2px solid var(--orange-primary)';
      element.style.overflow = 'hidden';
      element.style.whiteSpace = 'nowrap';
      
      let i = 0;
      const timer = setInterval(() => {
        if (i < text.length) {
          element.innerHTML += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          element.style.borderRight = 'none';
          element.style.overflow = 'visible';
          element.style.whiteSpace = 'normal';
        }
      }, speed);
    }
  }
  
  function progressiveReveal(element, html) {
    if (!element || !html) return;
    
    // For HTML content, we need to render it properly
    // First, set the HTML content
    element.innerHTML = html;
    
    // Then animate the paragraphs in
    const paragraphs = element.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
      p.classList.add('word-reveal');
      setTimeout(() => {
        p.classList.add('visible');
      }, index * 200);
    });
  }
  
  function animateTextIntoField(field, content, animationType = 'progressive') {
    if (!field || !content) return;
    
    // Clear field first
    field.value = '';
    field.innerHTML = '';
    
    // Add temporary styling for animation
    field.style.position = 'relative';
    
    if (animationType === 'typewriter') {
      typewriterEffect(field, content);
    } else {
      progressiveReveal(field, content);
    }
  }

  // ========== AI BAR RENDERING ==========
  
  function renderAIBar(aiBar) {
    if (!aiBar) return;
    
    if (aiBar.dataset.rendered === 'true') {
      console.log('[AI] Bar already rendered');
      return;
    }
    
    console.log('[AI] Rendering AI bar...');
    
    // Get custom prompts from settings (Phase 1 integration)
    const aiTemplates = getAITemplatesFromSettings();
    
    const suggestions = [
      { text: 'Warm intro after a call', prompt: aiTemplates.warm_intro, template: 'warm_intro' },
      { text: 'Follow-up with value props', prompt: aiTemplates.follow_up, template: 'follow_up' },
      { text: 'Energy Health Check', prompt: aiTemplates.energy_health, template: 'energy_health' },
      { text: 'Proposal delivery', prompt: aiTemplates.proposal, template: 'proposal' },
      { text: 'Cold email outreach', prompt: aiTemplates.cold_email, template: 'cold_email' },
      { text: 'Invoice request', prompt: aiTemplates.invoice, template: 'invoice' }
    ];
    
    aiBar.innerHTML = `
      <div class="ai-inner">
        <div class="ai-row">
          <textarea class="ai-prompt input-dark" rows="3" 
                    placeholder="Describe the email you want... (tone, goal, offer, CTA)"></textarea>
        </div>
        <div class="ai-row suggestions" role="list">
          ${suggestions.map(s => 
            `<button class="ai-suggestion" type="button" 
                     data-prompt="${escapeHtml(s.prompt)}" 
                     data-template="${s.template}">${s.text}</button>`
          ).join('')}
        </div>
        <div class="ai-row actions">
          <button class="fmt-btn ai-generate" data-mode="standard">Generate Standard</button>
          <button class="fmt-btn ai-generate" data-mode="html">Generate HTML</button>
          <div class="ai-status" aria-live="polite"></div>
        </div>
      </div>
    `;
    
    // Wire events
    wireAIBarEvents(aiBar);
    aiBar.dataset.rendered = 'true';
  }

  // Wire AI bar events
  function wireAIBarEvents(aiBar) {
    console.log('[AI] Wiring suggestion button events...');
    const suggestionButtons = aiBar.querySelectorAll('.ai-suggestion');
    console.log('[AI] Found suggestion buttons:', suggestionButtons.length);
    
    suggestionButtons.forEach((btn, index) => {
      console.log(`[AI] Adding click listener to suggestion ${index}:`, btn.textContent);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[AI] Suggestion clicked:', btn.textContent);
        const ta = aiBar.querySelector('.ai-prompt');
        if (ta) {
          const prompt = btn.getAttribute('data-prompt') || btn.textContent;
          ta.value = prompt;
          ta.focus();
          console.log('[AI] Updated textarea value:', ta.value);
        }
      });
    });
    
    console.log('[AI] Wiring generate button events...');
    aiBar.querySelectorAll('.ai-generate').forEach((btn, index) => {
      console.log(`[AI] Adding click listener to generate button ${index}:`, btn.textContent);
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[AI] Generate button clicked:', btn.textContent);
        const mode = btn.getAttribute('data-mode') || 'standard';
        await generateWithAI(aiBar, mode);
      });
    });
  }

  // Helper function to get AI templates from settings
  function getAITemplatesFromSettings() {
    try {
      const settings = window.SettingsPage?.getSettings?.() || {};
      const aiTemplates = settings?.aiTemplates || {};
      
      return {
        warm_intro: aiTemplates.warm_intro || 'Warm intro after a call',
        follow_up: aiTemplates.follow_up || 'Follow-up with tailored value props',
        energy_health: aiTemplates.energy_health || 'Schedule an Energy Health Check',
        proposal: aiTemplates.proposal || 'Proposal delivery with next steps',
        cold_email: aiTemplates.cold_email || 'Cold email to a lead I could not reach by phone',
        invoice: aiTemplates.invoice || 'Standard Invoice Request',
        who_we_are: aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.',
        // NEW: Market Context
        marketContext: aiTemplates.marketContext || {
          enabled: true,
          rateIncrease: '15-25%',
          renewalYears: '2025-2026',
          earlyRenewalSavings: '20-30%',
          typicalClientSavings: '10-20%',
          marketInsights: 'due to data center demand'
        }
      };
    } catch (error) {
      console.warn('[AI] Error getting templates from settings:', error);
      return {
        warm_intro: 'Warm intro after a call',
        follow_up: 'Follow-up with tailored value props',
        energy_health: 'Schedule an Energy Health Check',
        proposal: 'Proposal delivery with next steps',
        cold_email: 'Cold email to a lead I could not reach by phone',
        invoice: 'Standard Invoice Request',
        who_we_are: 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.',
        marketContext: {
          enabled: true,
          rateIncrease: '15-25%',
          renewalYears: '2025-2026',
          earlyRenewalSavings: '20-30%',
          typicalClientSavings: '10-20%',
          marketInsights: 'due to data center demand'
        }
      };
    }
  }

  // Helper function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== AI HELPER FUNCTIONS ==========
  
  async function lookupPersonByEmail(email) {
    try {
      const e = String(email || '').trim().toLowerCase();
      if (!e) return null;
      
      // Try Firebase first (like old emails.js)
      if (window.firebaseDB) {
        let snap;
        try {
          snap = await window.firebaseDB.collection('contacts').where('email', '==', e).limit(1).get();
        } catch (_) {
          snap = null;
        }
        if (!snap || snap.empty) {
          try {
            snap = await window.firebaseDB.collection('people').where('email', '==', e).limit(1).get();
          } catch (_) {
            snap = null;
          }
        }
        if (snap && !snap.empty) {
          const doc = snap.docs[0];
          const person = { id: doc.id, ...(doc.data ? doc.data() : {}) };
          
          // Attempt to match an account (like old emails.js)
          let account = null;
          if (window.BackgroundAccountsLoader) {
            const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
            const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
            const comp = norm(person.company || '');
            
            if (comp) {
              account = accounts.find(a => {
                const accountName = a.accountName || a.name || '';
                if (!accountName) return false;
                const normalizedAccountName = norm(accountName);
                return normalizedAccountName === comp || 
                       normalizedAccountName.includes(comp) || 
                       comp.includes(normalizedAccountName);
              }) || null;
            }
          }
          
          return {
            id: person.id,
            email: email,
            name: person.name || person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || email.split('@')[0],
            firstName: person.firstName || (person.name || '').split(' ')[0] || '',
            lastName: person.lastName || (person.name || '').split(' ').slice(1).join(' ') || '',
            fullName: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
            company: person.company || account?.accountName || account?.name || '',
            title: person.title || person.job || person.role || '',
            phone: person.phone || person.mobile || '',
            account: account ? {
              id: account.id,
              name: account.accountName || account.name || '',
              industry: account.industry || '',
              domain: account.domain || account.website || '',
              city: account.city || account.billingCity || account.locationCity || '',
              state: account.state || account.billingState || account.region || '',
              shortDescription: account.shortDescription || account.short_desc || account.descriptionShort || account.description || '',
              logoUrl: account.logoUrl || '',
              phone: account.phone || account.companyPhone || '',
              annualUsage: account.annualUsage || '',
              electricitySupplier: account.electricitySupplier || '',
              currentRate: account.currentRate || '',
              contractEndDate: account.contractEndDate || ''
            } : null
          };
        }
      }
      
      // Fallback to cache-based lookup
      let people = [];
      if (window.BackgroundPeopleLoader && typeof window.BackgroundPeopleLoader.getPeopleData === 'function') {
        people = window.BackgroundPeopleLoader.getPeopleData() || [];
      }
      
      const person = people.find(p => 
        p.email === email || 
        p.workEmail === email || 
        p.personalEmail === email
      );
      
      if (person) {
        return {
          email: email,
          name: person.name || person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim() || email.split('@')[0],
          firstName: person.firstName || (person.name || '').split(' ')[0] || '',
          lastName: person.lastName || (person.name || '').split(' ').slice(1).join(' ') || '',
          fullName: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
          company: person.company || person.accountName || '',
          title: person.title || person.job || person.role || '',
          phone: person.phone || person.mobile || ''
        };
      }
      
      // Final fallback
      return {
        email: email,
        name: email.split('@')[0],
        firstName: email.split('@')[0],
        company: '',
        title: '',
        phone: ''
      };
    } catch (error) {
      console.warn('[AI] Error looking up person:', error);
      return {
        email: email,
        name: email.split('@')[0],
        firstName: email.split('@')[0],
        company: '',
        title: '',
        phone: ''
      };
    }
  }

  async function enrichRecipientWithAccountData(recipient) {
    if (!recipient) return recipient;

    try {
      // Get accounts data
      let accounts = [];
      
      // Priority 1: BackgroundAccountsLoader
      if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
        accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
      }
      
      // Priority 2: CacheManager
      if (accounts.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        accounts = await window.CacheManager.get('accounts') || [];
      }

      // Find matching account by company name OR email domain
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
      const comp = norm(recipient.company || '');
      const domain = (recipient.email || '').split('@')[1]?.toLowerCase() || '';
      
      let acct = null;
      
      // Try company name match first
      if (comp) {
        acct = accounts.find(a => {
          const accountName = a.accountName || a.name || '';
          if (!accountName) return false;
          const normalizedAccountName = norm(accountName);
          return normalizedAccountName === comp || 
                 normalizedAccountName.includes(comp) || 
                 comp.includes(normalizedAccountName);
        }) || null;
      }
      
      // Try domain match if no company match
      if (!acct && domain) {
        acct = accounts.find(a => {
          const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
          return d && domain.endsWith(d);
        }) || null;
      }

      if (acct) {
        // Update recipient company if it was missing
        if (!recipient.company) {
          recipient.company = acct.accountName || acct.name || '';
        }
        
        const acctEnergy = {
          supplier: acct.electricitySupplier || '',
          currentRate: acct.currentRate || '',
          usage: acct.annualUsage || '',
          contractEnd: acct.contractEndDate || ''
        };
        
        recipient.account = {
          id: acct.id,
          name: acct.accountName || acct.name || '',
          industry: acct.industry || '',
          domain: acct.domain || acct.website || '',
          city: acct.city || acct.billingCity || acct.locationCity || '',
          state: acct.state || acct.billingState || acct.region || '',
          shortDescription: acct.shortDescription || acct.short_desc || acct.descriptionShort || acct.description || '',
          logoUrl: acct.logoUrl || '',
          phone: acct.phone || acct.companyPhone || '',
          annualUsage: acct.annualUsage || '',
          electricitySupplier: acct.electricitySupplier || '',
          currentRate: acct.currentRate || '',
          contractEndDate: acct.contractEndDate || ''
        };
        
        let rate = String(acctEnergy.currentRate || '').trim();
        if (/^\.\d+$/.test(rate)) rate = '0' + rate;
        recipient.energy = { ...acctEnergy, currentRate: rate };
      }
    } catch (e) {
      console.warn('[AI] Could not enrich recipient with account data', e);
    }

    return recipient;
  }

  // ========== AI GENERATION CORE ==========
  
  async function generateWithAI(aiBar, mode = 'standard') {
    const compose = document.getElementById('compose-window');
    const editor = compose?.querySelector('.body-input');
    const status = aiBar?.querySelector('.ai-status');
    const prompt = aiBar?.querySelector('.ai-prompt')?.value?.trim() || '';
    const toInput = compose?.querySelector('#compose-to');
    
    // Start the generation animation
    startGeneratingAnimation(compose);
    const subjectInput = compose?.querySelector('#compose-subject');
    
    if (!editor) return;

    // Close AI bar immediately
    if (aiBar) {
      aiBar.classList.remove('open');
      aiBar.setAttribute('aria-hidden', 'true');
    }

    // Start generating animation
    startGeneratingAnimation(compose);
    if (status) status.textContent = 'Generating...';
    
    try {
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const genUrl = `${base}/api/perplexity-email`;
      
      console.log('[AI] Calling Perplexity Sonar...');

      // Get recipient data with enrichment
      let recipient = null;
      try {
        const toVal = toInput?.value || '';
        if (toVal) {
          recipient = await lookupPersonByEmail(toVal);
          // Enrich with account data
          recipient = await enrichRecipientWithAccountData(recipient);
        }
      } catch (error) {
        console.warn('[AI] Failed to lookup recipient:', error);
      }

      // Get sender name from settings
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderName = (g.firstName && g.lastName) 
        ? `${g.firstName} ${g.lastName}`.trim()
        : (g.agentName || 'Power Choosers Team');

      // Get "who we are" information from settings
      const aiTemplates = getAITemplatesFromSettings();
      const whoWeAre = aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.';

      // Call the API
      const response = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          recipient: recipient,
          mode: mode,
          senderName: senderName,
          whoWeAre: whoWeAre,
          // NEW: Pass market context
          marketContext: aiTemplates.marketContext
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[AI] Received response:', result);

      // Handle different response formats based on mode and templateType
      const templateType = result.templateType || null;
      const output = result.output || '';

      let subject = '';
      let html = '';

      if (templateType) {
        // HTML mode with structured JSON
        const formatted = formatTemplatedEmail(output, recipient, templateType);
        subject = formatted.subject;
        html = formatted.html;
      } else {
        // Standard mode with plain text
        const formatted = formatGeneratedEmail(output, recipient, mode);
        subject = formatted.subject;
        html = formatted.html;
      }

      // Insert the formatted content
      if (subject && subjectInput) {
        // Remove "Re:" prefix if it's a new email (not a reply)
        let cleanSubject = subject;
        if (cleanSubject.startsWith('Re: ')) {
          cleanSubject = cleanSubject.substring(4);
        }
        
        // Animate subject line with typewriter effect
        setTimeout(() => {
          typewriterEffect(subjectInput, cleanSubject, 50);
        }, 500);
      }

      if (html && editor) {
        // For HTML content, render it directly with a simple fade-in
        setTimeout(() => {
          editor.innerHTML = html;
          // Mark editor mode for proper signature handling
          if (templateType) {
            editor.setAttribute('data-mode', 'html');
          } else {
            editor.removeAttribute('data-mode');
          }
          editor.style.opacity = '0';
          editor.style.transform = 'translateY(10px)';
          editor.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          
          // Trigger the animation
          setTimeout(() => {
            editor.style.opacity = '1';
            editor.style.transform = 'translateY(0)';
          }, 50);
        }, 800);
      }

      // Stop generating animation after content is inserted
      setTimeout(() => {
        stopGeneratingAnimation(compose);
        if (status) status.textContent = 'Generated successfully!';
      }, 1200);

    } catch (error) {
      console.error('[AI] Generation failed:', error);
      stopGeneratingAnimation(compose);
      if (status) status.textContent = 'Generation failed. Please try again.';
    }
  }

  // ========== TEMPLATE BUILDER FUNCTIONS ==========
  
  function buildWarmIntroHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.call_reference || 'Thank you for taking the time to speak with me today.'}</p>
        
        <p>${data.main_message || 'I wanted to follow up on our conversation about your energy needs and how Power Choosers can help optimize your costs.'}</p>
        
        <p>${data.cta_text || 'Would you be available for a brief call this week to discuss next steps?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildFollowUpHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const valueProps = data.value_props || [
      'Lower electricity rates through competitive procurement',
      'Expert market analysis and timing recommendations',
      'Ongoing monitoring of your energy portfolio',
      'Transparent pricing with no hidden fees'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.progress_update || 'I wanted to follow up on our previous conversation about optimizing your energy costs.'}</p>
        
        <p>Here's how we can help ${company}:</p>
        <ul>
          ${valueProps.map(prop => `<li>${prop}</li>`).join('')}
        </ul>
        
        <p>${data.urgency_message || 'With energy markets showing volatility, now is an ideal time to secure favorable rates.'}</p>
        
        <p>${data.cta_text || 'Would you be interested in scheduling a brief call to discuss your specific situation?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildEnergyHealthHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const assessmentItems = data.assessment_items || [
      'Current rate analysis and market comparison',
      'Contract terms and renewal timing',
      'Usage patterns and optimization opportunities',
      'Potential savings calculations'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>I'd like to offer ${company} a complimentary Energy Health Check to ensure you're getting the best value from your current energy setup.</p>
        
        <p>During this assessment, we'll review:</p>
        <ul>
          ${assessmentItems.map(item => `<li>${item}</li>`).join('')}
        </ul>
        
        <p>${data.contract_info || 'This is especially valuable as your current contract approaches renewal.'}</p>
        
        <p>${data.benefits || 'You\'ll receive a detailed report with specific recommendations and potential savings opportunities.'}</p>
        
        <p>${data.cta_text || 'Would you be available for a 30-minute call this week to conduct this assessment?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildProposalHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const timeline = data.timeline || [
      'Contract review and market analysis',
      'Rate negotiation with suppliers',
      'Proposal presentation and review',
      'Implementation and monitoring setup'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.proposal_summary || 'I\'m pleased to present our proposal for optimizing your energy procurement strategy.'}</p>
        
        <p>${data.pricing_highlight || 'Based on current market conditions, we can secure rates that represent significant savings compared to your current arrangement.'}</p>
        
        <p>Our implementation timeline:</p>
        <ol>
          ${timeline.map(step => `<li>${step}</li>`).join('')}
        </ol>
        
        <p>${data.cta_text || 'I\'d like to schedule a call to walk through the proposal details and answer any questions you may have.'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildColdEmailHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.opening_hook || `${company} likely faces the same energy cost challenges as other businesses in your industry.`}</p>
        
        <p>${data.value_proposition || 'Power Choosers helps companies like yours secure better energy rates through competitive procurement and market expertise.'}</p>
        
        ${data.social_proof_optional ? `<p>${data.social_proof_optional}</p>` : ''}
        
        <p>${data.cta_text || 'Would you be open to a brief conversation about your current energy situation?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildInvoiceHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const checklistItems = data.checklist_items || [
      'Invoice date and service address',
      'Billing period (start and end dates)',
      'Detailed charge breakdown',
      'Payment details and terms'
    ];
    
    const discrepancies = data.discrepancies || [
      'High delivery charges',
      'Incorrect rate classifications',
      'Hidden fees or surcharges',
      'Poor contract terms'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.intro_paragraph || `As we discussed, I'll conduct a comprehensive energy analysis for ${company} to identify potential cost savings and optimization opportunities.`}</p>
        
        <p>To get started, I'll need to review your most recent energy invoice. Here's what I'll be looking for:</p>
        <ul>
          ${checklistItems.map(item => `<li>${item}</li>`).join('')}
        </ul>
        
        <p>Common issues I typically find include:</p>
        <ul>
          ${discrepancies.map(item => `<li>${item}</li>`).join('')}
        </ul>
        
        <p>${data.deadline || 'Please send the invoice by end of day so I can begin the analysis.'}</p>
        
        <p>${data.cta_text || 'Will you be able to send over the invoice by end of day so me and my team can get started?'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  function buildGeneralHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || 'there';
    
    const sections = data.sections || [
      'We help businesses optimize their energy procurement',
      'Our expertise can identify significant cost savings',
      'We provide ongoing monitoring and support'
    ];
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hi ${firstName},</p>
        
        <p>${data.list_header || 'How We Can Help:'}</p>
        <ul>
          ${sections.map(section => `<li>${section}</li>`).join('')}
        </ul>
        
        <p>${data.cta_text || 'I\'d love to discuss how we can help optimize your energy costs.'}</p>
        
        <p>Best regards,<br>
        Power Choosers Team</p>
      </div>
    `;
  }

  // ========== EMAIL FORMATTING FUNCTIONS ==========
  
  function wrapSonarHtmlWithBranding(sonarGeneratedHtml, recipient, subject) {
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const g = settings?.general || {};
    
    const senderFirstName = g.firstName || '';
    const senderLastName = g.lastName || '';
    const senderName = (senderFirstName && senderLastName) 
        ? `${senderFirstName} ${senderLastName}`.trim()
        : (g.agentName || 'Power Choosers Team');
    
    const senderEmail = g.email || 'l.patterson@powerchoosers.com';
    const senderPhone = g.phone || '';
    const senderTitle = g.jobTitle || 'Energy Strategist';
    const senderLocation = g.location || '';
    
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        ${sonarGeneratedHtml}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="margin: 0; font-size: 14px;">
            <strong>${senderName}</strong><br>
            ${senderTitle}<br>
            Power Choosers<br>
            ${senderLocation ? `${senderLocation}<br>` : ''}
            ${senderPhone ? `Phone: ${senderPhone}<br>` : ''}
            Email: ${senderEmail}
          </p>
        </div>
      </div>
    `;
  }

  function improveSubject(subject, recipient) {
    try {
      const firstName = recipient?.firstName || recipient?.name?.split(' ')[0] || '';
      if (firstName && !subject.toLowerCase().includes(firstName.toLowerCase())) {
        return `${subject} - ${firstName}`;
      }
      return subject;
    } catch (e) {
      console.warn('[AI] improveSubject failed', e);
      return subject;
    }
  }

  function replaceVariablesInHtml(html, recipient) {
    try {
      const r = recipient || {};
      const contact = r;
      const account = r.account || {};
      
      // Get sender info from settings (like wrapSonarHtmlWithBranding does)
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderFirstName = g.firstName || '';
      const senderLastName = g.lastName || '';
      const senderName = (senderFirstName && senderLastName) 
          ? `${senderFirstName} ${senderLastName}`.trim()
          : (g.agentName || 'Power Choosers Team');
      
      const sender = {
        first_name: senderFirstName,
        last_name: senderLastName,
        full_name: senderName,
        email: g.email || '',
        phone: g.phone || '',
        title: g.jobTitle || 'Energy Strategist',
        company: g.companyName || 'Power Choosers'
      };

      const get = (obj, key) => {
        const k = String(key || '').trim();
        const map = {
          first_name: (obj.firstName || (obj.name||'').split(' ')[0] || ''),
          last_name: (obj.lastName || (obj.name||'').split(' ').slice(1).join(' ') || ''),
          full_name: (obj.fullName || obj.name || [obj.firstName, obj.lastName].filter(Boolean).join(' ') || ''),
          title: (obj.title || obj.job || obj.role || obj.jobTitle || ''),
          email: (obj.email || ''),
          phone: (obj.phone || obj.mobile || ''),
          website: (obj.website || obj.domain || ''),
          name: (obj.name || obj.accountName || ''),
          industry: (obj.industry || ''),
          city: (obj.city || obj.billingCity || obj.locationCity || ''),
          state: (obj.state || obj.region || obj.billingState || ''),
          country: (obj.country || '')
        };
        return map.hasOwnProperty(k) ? (map[k] || '') : (obj[k] || '');
      };

      // Replace raw tokens first
      let out = String(html || '')
        .replace(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(contact, k)))
        .replace(/\{\{\s*account\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(account, k)))
        .replace(/\{\{\s*sender\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(sender, k)));

      // Replace .var-chip elements if present
      const tmp = document.createElement('div');
      tmp.innerHTML = out;
      tmp.querySelectorAll('.var-chip').forEach(chip => {
        const dataVar = chip.getAttribute('data-var') || '';
        const m = dataVar.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
        if (!m) { chip.replaceWith(document.createTextNode(chip.textContent||'')); return; }
        const scope = m[1];
        const key = m[2];
        let val = '';
        if (scope === 'contact') val = get(contact, key);
        else if (scope === 'account') val = get(account, key);
        else if (scope === 'sender') val = get(sender, key);
        chip.replaceWith(document.createTextNode(val || ''));
      });
      out = tmp.innerHTML;
      return out;
    } catch (e) {
      console.warn('[AI] replaceVariablesInHtml failed', e);
      return html;
    }
  }

  function formatTemplatedEmail(result, recipient, templateType) {
    try {
      console.log('[AI] Formatting templated email, type:', templateType);
      
      // Extract data from JSON response
      const subject = result.subject || 'Energy Solutions';
      
      // Build template HTML using the appropriate builder
      const templateHtml = buildTemplateHtml(templateType, result, recipient);
      
      // Wrap with branding (header + footer)
      const fullHtml = wrapSonarHtmlWithBranding(templateHtml, recipient, subject);
      
      console.log('[AI] Template email built successfully');
      
      return {
        subject: improveSubject(subject, recipient),
        html: fullHtml
      };
    } catch (error) {
      console.error('[AI] Error formatting templated email:', error);
      return {
        subject: 'Energy Solutions',
        html: '<p>Error generating email content.</p>'
      };
    }
  }

  function formatGeneratedEmail(result, recipient, mode) {
    try {
      console.log('[AI] Formatting generated email, mode:', mode);
      
      // Parse the result to extract subject and body
      const lines = result.split('\n');
      let subject = '';
      let body = '';
      let inBody = false;
      
      for (const line of lines) {
        if (line.startsWith('Subject:')) {
          subject = line.replace('Subject:', '').trim();
        } else if (line.trim() === '') {
          inBody = true;
        } else if (inBody) {
          body += line + '\n';
        }
      }
      
      // If no subject found, use a default
      if (!subject) {
        subject = 'Energy Solutions';
      }
      
      // Convert body to HTML
      const htmlBody = body
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
      
      // Check mode: HTML uses profile branding, standard uses signature settings
      if (mode === 'html') {
        // HTML mode: Wrap with branding for profile-based signature
        const fullHtml = wrapSonarHtmlWithBranding(htmlBody, recipient, subject);
        
        return {
          subject: improveSubject(subject, recipient),
          html: fullHtml
        };
      } else {
        // Standard mode: Return content without branding so sendEmail() can append signature settings
        return {
          subject: improveSubject(subject, recipient),
          html: htmlBody
        };
      }
    } catch (error) {
      console.error('[AI] Error formatting generated email:', error);
      return {
        subject: 'Energy Solutions',
        html: '<p>Error generating email content.</p>'
      };
    }
  }

  function buildTemplateHtml(templateType, data, recipient) {
    const fromEmail = 'l.patterson@powerchoosers.com';
    
    switch (templateType) {
      case 'warm_intro':
        return buildWarmIntroHtml(data, recipient, fromEmail);
      case 'follow_up':
        return buildFollowUpHtml(data, recipient, fromEmail);
      case 'energy_health':
        return buildEnergyHealthHtml(data, recipient, fromEmail);
      case 'proposal':
        return buildProposalHtml(data, recipient, fromEmail);
      case 'cold_email':
        return buildColdEmailHtml(data, recipient, fromEmail);
      case 'invoice':
        return buildInvoiceHtml(data, recipient, fromEmail);
      case 'general':
        return buildGeneralHtml(data, recipient, fromEmail);
      default:
        return buildGeneralHtml(data, recipient, fromEmail);
    }
  }

  // ========== AI BUTTON HANDLER ==========
  
  function setupAIButtonHandler() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="ai"]')) {
        e.preventDefault();
        e.stopPropagation();
        
        const composeWindow = document.getElementById('compose-window');
        const aiBar = composeWindow?.querySelector('.ai-bar');
        
        if (aiBar) {
          // Initialize AI bar if not already rendered
          if (!aiBar.dataset.rendered) {
            renderAIBar(aiBar);
          }
          
          // Toggle AI bar
          const isOpen = aiBar.classList.toggle('open');
          aiBar.setAttribute('aria-hidden', String(!isOpen));
          
          console.log('[AI] AI bar toggled:', isOpen ? 'open' : 'closed');
        }
      }
    });
  }

  // ========== EMAIL SENDING FUNCTIONS ==========
  
  async function sendEmailViaSendGrid(emailData) {
    try {
      const { to, subject, content, _deliverability, threadId, inReplyTo, references, trackingMetadata } = emailData;
      
      // Generate unique tracking ID for this email
      const trackingId = `sendgrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare email data for SendGrid
      const emailPayload = {
        to: to,
        subject: subject,
        content: content,
        trackingId: trackingId,
        threadId: threadId,
        inReplyTo: inReplyTo,
        references: references,
        _deliverability: _deliverability
      };
      
      // Send via SendGrid API
      const response = await fetch(`${window.API_BASE_URL}/api/email/sendgrid-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email via SendGrid');
      }

      const result = await response.json();
      console.log('[SendGrid] Email sent successfully:', result);
      
      // Store email record for tracking
      if (window.emailTrackingManager && result.trackingId) {
        const trackingEmailData = {
          id: result.trackingId,
          to: emailData.to,
          subject: emailData.subject,
          content: content,
          from: 'Lewis Patterson <noreply@powerchoosers.com>',
          provider: 'sendgrid',
          sentVia: 'sendgrid',
          sendgridMessageId: result.messageId, // SendGrid's x-message-id
          sentAt: new Date().toISOString(),
          threadId: threadId || null,
          inReplyTo: inReplyTo || null,
          references: Array.isArray(references) ? references : (references ? [references] : []),
          trackingMetadata: trackingMetadata || null
        };
        
        try {
          await window.emailTrackingManager.saveEmailRecord(trackingEmailData);
          console.log('[SendGrid] Email record saved to tracking system');
        } catch (trackingError) {
          console.warn('[SendGrid] Failed to save email record:', trackingError);
        }
      }
      
      return {
        success: true,
        trackingId: result.trackingId,
        messageId: result.trackingId,
        message: 'Email sent successfully via SendGrid'
      };

    } catch (error) {
      console.error('[SendGrid] Send error:', error);
      throw error;
    }
  }

  async function sendEmail() {
    const toInput = document.getElementById('compose-to');
    const subjectInput = document.getElementById('compose-subject');
    const bodyInput = document.querySelector('.body-input');
    
    const to = toInput?.value?.trim() || '';
    const subject = subjectInput?.value?.trim() || '';
    
    // Detect HTML mode and extract content appropriately
    const isHtmlMode = bodyInput?.getAttribute('data-mode') === 'html';
    const body = isHtmlMode ? 
      (bodyInput?.textContent || '') :  // HTML mode: get raw HTML code
      (bodyInput?.innerHTML || '');     // Text mode: get rendered HTML
    
    console.log('[EmailCompose] Email mode:', isHtmlMode ? 'HTML' : 'Text');
    console.log('[EmailCompose] Content preview:', body.substring(0, 100) + '...');
    
    if (!to) {
      window.crm?.showToast('Please enter recipients');
      toInput?.focus();
      return;
    }
    
    if (!subject) {
      window.crm?.showToast('Please enter a subject');
      subjectInput?.focus();
      return;
    }
    
    if (!body) {
      window.crm?.showToast('Please enter email content');
      bodyInput?.focus();
      return;
    }

    try {
      // Get deliverability settings from settings.js
      const settings = (window.SettingsPage && window.SettingsPage.getSettings) ? window.SettingsPage.getSettings() : (JSON.parse(localStorage.getItem('crm-settings')||'{}'));
      const deliver = settings?.emailDeliverability || {};
      
      // Show sending state
      const sendButton = document.querySelector('#compose-send');
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.textContent = 'Sending...';
      }

      // Optionally remove signature image if disabled
      let preparedBody = body;
      if (deliver.signatureImageEnabled === false) {
        preparedBody = preparedBody.replace(/<img[^>]*alt=\"Signature\"[\s\S]*?>/gi, '');
      }

      // Check if signature is already in the body (prevent duplication)
      const signature = window.getEmailSignature ? window.getEmailSignature() : '';
      const hasSignature = preparedBody.includes('margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;');

      // Only add signature for standard mode (non-HTML AI emails)
      // HTML templates have their own hardcoded signatures via wrapSonarHtmlWithBranding
      let contentWithSignature = preparedBody;
      if (!isHtmlMode && !hasSignature && signature) {
        contentWithSignature = preparedBody + signature;
      }

      const emailData = {
        to: to.split(',').map(email => email.trim()),
        subject,
        content: contentWithSignature,
        trackingMetadata: window._lastGeneratedMetadata || null
      };

      // Send via SendGrid
      let result;
      try {
        console.log('[EmailCompose] Sending via SendGrid...');
        result = await sendEmailViaSendGrid({ ...emailData, _deliverability: deliver });
        console.log('[EmailCompose] Email sent via SendGrid');
        
        // Track email performance if metadata is available
        if (window._lastGeneratedMetadata) {
          const trackingData = {
            emailId: result.trackingId || `email_${Date.now()}`,
            recipientEmail: to,
            subjectStyle: window._lastGeneratedMetadata.subject_style,
            ctaType: window._lastGeneratedMetadata.cta_type,
            openingStyle: window._lastGeneratedMetadata.opening_style,
            timestamp: new Date().toISOString(),
            event: 'sent'
          };
          
          // Send to tracking endpoint
          fetch('/api/track-email-performance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trackingData)
          }).catch(err => console.warn('[Tracking] Failed to log send event:', err));
          
          // Clear metadata after tracking
          window._lastGeneratedMetadata = null;
        }
      } catch (sendGridError) {
        console.error('[EmailCompose] SendGrid failed:', sendGridError);
        throw new Error(`Failed to send email: ${sendGridError.message}`);
      }
      
      // Close compose window on success
      closeComposeWindow();
      
      // Show success message
      window.crm?.showToast('Email sent successfully!');

    } catch (error) {
      console.error('[EmailCompose] Send email error:', error);
      window.crm?.showToast('Failed to send email: ' + error.message);
    } finally {
      // Reset send button
      const sendButton = document.querySelector('#compose-send');
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = 'Send';
      }
    }
  }

  function closeComposeWindow() {
    const composeWindow = document.getElementById('compose-window');
    if (composeWindow) {
      composeWindow.classList.remove('open');
      setTimeout(() => {
        composeWindow.style.display = 'none';
      }, 300);
    }
  }

  function setupSendButtonHandler() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#compose-send')) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[EmailCompose] Send button clicked');
        sendEmail();
      }
    });
  }

  // ========== INITIALIZATION ==========
  
  // Setup AI functionality
  setupAIButtonHandler();
  
  // Setup send button functionality
  setupSendButtonHandler();

  console.log('[EmailCompose] Global module with AI and send functionality initialized');
})();
