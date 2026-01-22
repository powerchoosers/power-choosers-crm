/**
 * Contact Merger - Intelligent contact deduplication and merging system
 * Handles merging duplicate contacts with smart field combination
 */

class ContactMerger {
  constructor() {
    this.mergeStrategies = {
      // Fields that should use the non-empty value (prefer new data)
      preferNew: ['firstName', 'lastName', 'title', 'department', 'seniority', 'linkedin'],
      
      // Fields that should use the non-empty value (prefer existing data)
      preferExisting: ['email', 'companyName', 'accountId'],
      
      // Fields that should be combined/merged
      combine: ['mobile', 'workDirectPhone', 'otherPhone', 'notes'],
      
      // Fields that should use the most recent timestamp
      useLatest: ['updatedAt', 'enrichedAt'],
      
      // Fields that should be preserved from existing
      preserve: ['id', 'createdAt', 'importedAt']
    };
  }

  /**
   * Find potential duplicate contacts
   */
  async findDuplicates(contact, existingContacts) {
    const duplicates = [];
    
    for (const existing of existingContacts) {
      const similarity = this.calculateSimilarity(contact, existing);
      if (similarity.score >= 0.8) { // 80% similarity threshold
        duplicates.push({
          contact: existing,
          similarity: similarity
        });
      }
    }
    
    return duplicates.sort((a, b) => b.similarity.score - a.similarity.score);
  }

  /**
   * Calculate similarity between two contacts
   */
  calculateSimilarity(contact1, contact2) {
    const weights = {
      email: 0.4,           // Email is most important
      phone: 0.3,           // Phone numbers are very important
      name: 0.2,            // Name similarity
      company: 0.1          // Company similarity
    };

    let totalScore = 0;
    let maxScore = 0;
    const matches = [];

    // Email match (exact)
    if (contact1.email && contact2.email) {
      if (contact1.email.toLowerCase() === contact2.email.toLowerCase()) {
        totalScore += weights.email;
        matches.push('email');
      }
    }
    maxScore += weights.email;

    // Phone match (normalized)
    const phones1 = this.getNormalizedPhones(contact1);
    const phones2 = this.getNormalizedPhones(contact2);
    if (phones1.length > 0 && phones2.length > 0) {
      const phoneMatch = phones1.some(p1 => phones2.some(p2 => p1 === p2));
      if (phoneMatch) {
        totalScore += weights.phone;
        matches.push('phone');
      }
    }
    maxScore += weights.phone;

    // Name similarity
    const nameScore = this.calculateNameSimilarity(contact1, contact2);
    totalScore += nameScore * weights.name;
    maxScore += weights.name;
    if (nameScore > 0.7) matches.push('name');

    // Company similarity
    const companyScore = this.calculateCompanySimilarity(contact1, contact2);
    totalScore += companyScore * weights.company;
    maxScore += weights.company;
    if (companyScore > 0.7) matches.push('company');

    return {
      score: maxScore > 0 ? totalScore / maxScore : 0,
      matches: matches,
      details: {
        email: contact1.email && contact2.email && 
               contact1.email.toLowerCase() === contact2.email.toLowerCase(),
        phone: phones1.length > 0 && phones2.length > 0 && 
               phones1.some(p1 => phones2.some(p2 => p1 === p2)),
        name: nameScore > 0.7,
        company: companyScore > 0.7
      }
    };
  }

  /**
   * Get normalized phone numbers from a contact
   */
  getNormalizedPhones(contact) {
    const phones = [];
    if (contact.mobile) phones.push(this.normalizePhoneForComparison(contact.mobile));
    if (contact.workDirectPhone) phones.push(this.normalizePhoneForComparison(contact.workDirectPhone));
    if (contact.otherPhone) phones.push(this.normalizePhoneForComparison(contact.otherPhone));
    return phones.filter(p => p);
  }

  /**
   * Normalize phone for comparison (digits only)
   */
  normalizePhoneForComparison(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  /**
   * Calculate name similarity
   */
  calculateNameSimilarity(contact1, contact2) {
    const name1 = this.getFullName(contact1).toLowerCase();
    const name2 = this.getFullName(contact2).toLowerCase();
    
    if (!name1 || !name2) return 0;
    
    // Exact match
    if (name1 === name2) return 1;
    
    // Check if one name contains the other
    if (name1.includes(name2) || name2.includes(name1)) return 0.8;
    
    // Simple word-based similarity
    const words1 = name1.split(/\s+/);
    const words2 = name2.split(/\s+/);
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 === word2 && word1.length > 2) {
          matches++;
          break;
        }
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
  }

  /**
   * Calculate company similarity
   */
  calculateCompanySimilarity(contact1, contact2) {
    const company1 = (contact1.companyName || '').toLowerCase();
    const company2 = (contact2.companyName || '').toLowerCase();
    
    if (!company1 || !company2) return 0;
    
    // Exact match
    if (company1 === company2) return 1;
    
    // Check if one contains the other
    if (company1.includes(company2) || company2.includes(company1)) return 0.8;
    
    // Simple word-based similarity
    const words1 = company1.split(/\s+/);
    const words2 = company2.split(/\s+/);
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 === word2 && word1.length > 2) {
          matches++;
          break;
        }
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
  }

  /**
   * Get full name from contact
   */
  getFullName(contact) {
    const parts = [];
    if (contact.firstName) parts.push(contact.firstName);
    if (contact.lastName) parts.push(contact.lastName);
    if (parts.length === 0 && contact.name) parts.push(contact.name);
    return parts.join(' ');
  }

  /**
   * Merge two contacts intelligently
   */
  mergeContacts(existingContact, newContact) {
    const merged = { ...existingContact };
    
    // Apply merge strategies
    for (const [strategy, fields] of Object.entries(this.mergeStrategies)) {
      for (const field of fields) {
        if (strategy === 'preferNew') {
          // Use new value if it's not empty, otherwise keep existing
          if (newContact[field] && newContact[field].toString().trim()) {
            merged[field] = newContact[field];
          }
        } else if (strategy === 'preferExisting') {
          // Use existing value if it's not empty, otherwise use new
          if (!merged[field] || !merged[field].toString().trim()) {
            merged[field] = newContact[field];
          }
        } else if (strategy === 'combine') {
          // Combine values intelligently
          merged[field] = this.combineFieldValues(merged[field], newContact[field]);
        } else if (strategy === 'useLatest') {
          // Use the most recent timestamp
          const existingTime = new Date(merged[field] || 0).getTime();
          const newTime = new Date(newContact[field] || 0).getTime();
          merged[field] = newTime > existingTime ? newContact[field] : merged[field];
        }
        // 'preserve' strategy - keep existing value (already done by spreading existingContact)
      }
    }
    
    // Set updated timestamp
    merged.updatedAt = Date.now();
    merged.mergedAt = Date.now();
    merged.mergeSource = newContact.id || 'import';
    
    return merged;
  }

  /**
   * Combine field values intelligently
   */
  combineFieldValues(existingValue, newValue) {
    if (!existingValue && !newValue) return '';
    if (!existingValue) return newValue;
    if (!newValue) return existingValue;
    
    const existing = existingValue.toString().trim();
    const newVal = newValue.toString().trim();
    
    // If they're the same, return one
    if (existing === newVal) return existing;
    
    // For phone numbers, combine unique numbers
    if (this.isPhoneField(existing) || this.isPhoneField(newVal)) {
      const phones = new Set();
      if (existing) phones.add(existing);
      if (newVal) phones.add(newVal);
      return Array.from(phones).join(', ');
    }
    
    // For notes, combine with separator
    if (existing && newVal) {
      return `${existing}\n\n--- Merged Note ---\n${newVal}`;
    }
    
    // Default: prefer non-empty value
    return newVal || existing;
  }

  /**
   * Check if a value looks like a phone number
   */
  isPhoneField(value) {
    if (!value) return false;
    const str = value.toString();
    return /^[\+]?[\d\s\-\(\)]+$/.test(str) && str.replace(/\D/g, '').length >= 10;
  }

  /**
   * Show merge confirmation dialog
   */
  async showMergeConfirmation(existingContact, newContact, similarity) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'pc-modal';
      modal.innerHTML = `
        <div class="pc-modal__backdrop"></div>
        <div class="pc-modal__dialog" style="max-width: 600px;">
          <div class="pc-modal__header">
            <h3>Merge Duplicate Contact</h3>
            <button class="pc-modal__close" type="button">×</button>
          </div>
          <div class="pc-modal__body">
            <p>We found a potential duplicate contact. Would you like to merge them?</p>
            
            <div class="merge-comparison">
              <div class="merge-contact">
                <h4>Existing Contact</h4>
                <div class="contact-preview">
                  <strong>${this.getFullName(existingContact) || 'Unknown'}</strong><br>
                  ${existingContact.email || 'No email'}<br>
                  ${existingContact.companyName || 'No company'}<br>
                  ${this.getNormalizedPhones(existingContact).join(', ') || 'No phone'}
                </div>
              </div>
              
              <div class="merge-contact">
                <h4>New Contact</h4>
                <div class="contact-preview">
                  <strong>${this.getFullName(newContact) || 'Unknown'}</strong><br>
                  ${newContact.email || 'No email'}<br>
                  ${newContact.companyName || 'No company'}<br>
                  ${this.getNormalizedPhones(newContact).join(', ') || 'No phone'}
                </div>
              </div>
            </div>
            
            <div class="similarity-info">
              <strong>Similarity: ${Math.round(similarity.score * 100)}%</strong><br>
              Matches: ${similarity.matches.join(', ')}
            </div>
          </div>
          <div class="pc-modal__footer">
            <button class="btn-secondary" data-action="skip">Skip (Create New)</button>
            <button class="btn-secondary" data-action="cancel">Cancel Import</button>
            <button class="btn-primary" data-action="merge">Merge Contacts</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const handleAction = (action) => {
        document.body.removeChild(modal);
        resolve(action);
      };
      
      modal.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          handleAction(action);
        });
      });
      
      modal.querySelector('.pc-modal__backdrop').addEventListener('click', () => {
        handleAction('cancel');
      });
    });
  }
}

// Create global instance
window.ContactMerger = new ContactMerger();
