// Power Choosers CRM Dashboard - Call Scripts Module
// This module contains all call scripts functionality

// Extend CRMApp with call scripts functions
Object.assign(CRMApp, {
    // Function to load and display the Call Scripts view
  showCallScriptsView() {
      console.log('showCallScriptsView called');
      
      // Initialize call scripts functionality
      this.initializeCallScripts();
      
      // Auto-populate fields
      this.autoPopulateCallScripts();
  },

    // Initialize call scripts functionality
    initializeCallScripts() {
        console.log('Initializing call scripts functionality');
        
        // Setup dial button listener
        const dialBtn = document.getElementById('dial-btn');
        if (dialBtn) {
            dialBtn.addEventListener('click', this.handleDialClick.bind(this));
        }
        
        // Setup other call script event listeners
        this.setupCallScriptListeners();
    },

    setupCallScriptListeners() {
        // Add event listeners for call script interactions
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('response-option')) {
                this.selectResponse(e.target.textContent);
            }
            
            if (e.target.id === 'go-back-btn') {
                this.goBack();
            }
            
            if (e.target.id === 'restart-btn') {
                this.restart();
            }
            
            if (e.target.id === 'save-prospect-btn') {
                this.saveProspectAndNotes();
            }
            
            if (e.target.id === 'clear-notes-btn') {
                this.clearNotes();
            }
        });
    },

    // Auto-populate fields in the Call Scripts page
    autoPopulateCallScripts() {
        console.log('Auto-populating call scripts fields');
        
        // Get a random contact for demonstration
        if (this.contacts && this.contacts.length > 0) {
            const randomContact = this.contacts[Math.floor(Math.random() * this.contacts.length)];
            
            // Populate contact fields
            const nameField = document.getElementById('contact-name');
            const companyField = document.getElementById('company-name');
            const phoneField = document.getElementById('phone-number');
            
            if (nameField) nameField.value = `${randomContact.firstName} ${randomContact.lastName}`;
            if (companyField) companyField.value = randomContact.accountName || 'Unknown Company';
            if (phoneField) phoneField.value = randomContact.phone || '(555) 123-4567';
        }
        
        // Set current date and time
        const dateField = document.getElementById('call-date');
        const timeField = document.getElementById('call-time');
        
        if (dateField) dateField.value = new Date().toISOString().split('T')[0];
        if (timeField) timeField.value = new Date().toTimeString().slice(0, 5);
    },

    // Handle dial button click
    handleDialClick() {
        console.log('Dial button clicked');
        
        const phoneNumber = document.getElementById('phone-number')?.value;
        const contactName = document.getElementById('contact-name')?.value;
        
        if (!phoneNumber) {
            this.showNotification('Please enter a phone number', 'error');
            return;
        }
        
        // Show calling status
        this.showNotification(`Calling ${contactName || 'contact'} at ${phoneNumber}...`, 'info');
        
        // Simulate call connection after 2 seconds
        setTimeout(() => {
            this.showNotification('Call connected! Use the script below.', 'success');
            this.updateScript();
        }, 2000);
    },

    // Handle response selection
    selectResponse(response) {
        console.log('Response selected:', response);
        
        // Add to call notes
        const notesArea = document.getElementById('call-notes');
        if (notesArea) {
            const timestamp = new Date().toLocaleTimeString();
            const currentNotes = notesArea.value;
            notesArea.value = currentNotes + `[${timestamp}] Selected: ${response}\n`;
        }
        
        // Show next script step based on response
        this.showNotification(`Response recorded: ${response}`, 'info');
        this.updateScript();
    },

    // Go back in call script
    goBack() {
        console.log('Going back in call script');
        this.showNotification('Going back to previous step', 'info');
        this.updateScript();
    },

    // Restart call script
    restart() {
        console.log('Restarting call script');
        
        // Clear notes
        const notesArea = document.getElementById('call-notes');
        if (notesArea) {
            notesArea.value = '';
        }
        
        // Reset script
        this.showNotification('Call script restarted', 'info');
        this.updateScript();
    },

    // Save prospect and notes
    saveProspectAndNotes() {
        console.log('Saving prospect and notes');
        
        const contactName = document.getElementById('contact-name')?.value;
        const companyName = document.getElementById('company-name')?.value;
        const phoneNumber = document.getElementById('phone-number')?.value;
        const notes = document.getElementById('call-notes')?.value;
        const disposition = document.getElementById('call-disposition')?.value;
        
        if (!contactName || !notes) {
            this.showNotification('Please fill in contact name and notes', 'error');
            return;
        }
        
        // Create call log data
        const callLogData = {
            contactName: contactName,
            companyName: companyName,
            phoneNumber: phoneNumber,
            notes: notes,
            disposition: disposition || 'completed',
            callDate: new Date(),
            duration: '5:30' // Mock duration
        };
        
        // Save call log
        this.saveCallLog(callLogData, disposition);
    },

    // Clear notes
    clearNotes() {
        console.log('Clearing notes');
        
        const notesArea = document.getElementById('call-notes');
        if (notesArea) {
            notesArea.value = '';
        }
        
        this.showNotification('Notes cleared', 'info');
    },

    // Update script display
    updateScript() {
        console.log('Updating script display');
        
        // This would update the script content based on the current step
        // For now, just show a notification
        this.showNotification('Script updated', 'info');
    },

    // Save call log to Firebase and update notifications
    async saveCallLog(logData, disposition) {
        try {
            console.log('Saving call log:', logData);
            
            // Create activity record
            const activity = {
                type: 'call_log_saved',
                description: `Call completed with ${logData.contactName} at ${logData.companyName}`,
                noteContent: logData.notes,
                contactName: logData.contactName,
                accountName: logData.companyName,
                createdAt: new Date()
            };
            
            // Save to activities
            await this.saveActivity(activity);
            
            // Show success notification
            this.showNotification('Call log saved successfully!', 'success');
            
            // Update dashboard stats
            this.renderDashboardStats();
            
            // Clear the form
            this.clearCallForm();
            
        } catch (error) {
            console.error('Error saving call log:', error);
            this.showNotification('Error saving call log: ' + error.message, 'error');
        }
    },

    // Clear call form
    clearCallForm() {
        const fields = ['contact-name', 'company-name', 'phone-number', 'call-notes'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.value = '';
        });
        
        const disposition = document.getElementById('call-disposition');
        if (disposition) disposition.selectedIndex = 0;
    },

    // Update account details from Energy Health Check results
    updateAccountDetailsFromHealthCheck(companyName, healthCheckData) {
        try {
            console.log('Updating account details from health check:', companyName, healthCheckData);
            
            // Find existing account or create new one
            let account = this.accounts.find(a => 
                a.name.toLowerCase().includes(companyName.toLowerCase()) ||
                companyName.toLowerCase().includes(a.name.toLowerCase())
            );
            
            if (account) {
                // Update existing account
                account.healthCheckData = healthCheckData;
                account.lastHealthCheck = new Date();
                
                console.log('Updated existing account:', account.name);
                this.showNotification(`Updated health check data for ${account.name}`, 'success');
            } else {
                // Create new account
                const newAccount = {
                    id: 'acc_' + Date.now(),
                    name: companyName,
                    healthCheckData: healthCheckData,
                    lastHealthCheck: new Date(),
                    industry: 'Energy',
                    createdAt: new Date()
                };
                
                this.accounts.push(newAccount);
                console.log('Created new account:', newAccount.name);
                this.showNotification(`Created new account: ${newAccount.name}`, 'success');
            }
            
            // Save activity
            this.saveActivity({
                type: 'health_check_updated',
                description: `Energy Health Check completed for ${companyName}`,
                accountName: companyName
            });
            
            // Update dashboard
            this.renderDashboardStats();
            
        } catch (error) {
            console.error('Error updating account details:', error);
            this.showNotification('Error updating account details', 'error');
        }
    }
});
