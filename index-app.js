        // Firebase Configuration
        const firebaseConfig = {
            apiKey: "AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE",
            authDomain: "power-choosers-crm.firebaseapp.com",
            projectId: "power-choosers-crm",
            storageBucket: "power-choosers-crm.firebasestorage.app",
            messagingSenderId: "792458658491",
            appId: "1:792458658491:web:a197a4a8ce7a860cfa1f9e",
            measurementId: "G-XEC3BFHJHW"
        };
        
        // Initialize Firebase
        const app = firebase.initializeApp(firebaseConfig);
        const db = app.firestore();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
        
        // Utility Functions
        const gId = id => document.getElementById(id);

        // Application State
        const CRMApp = {
            currentView: 'dashboard',
            currentAccount: null,
            currentContact: null,
            accounts: [],
            contacts: [],
            activities: []
        };
        
        // Search State
        let currentSearchType = '';
        let activeButton = null;
        let currentProspect = {}; 

        // Script Placeholders
        const placeholders = {
            'N': '', 'YN': 'Lewis', 'CN': '', 'CI': '', 'SB': '', 'PP': '', 'CT': '', 'TIA': '', 
            'TE': '', 'DT': '', 'EAC': '', 'TF': '', 'OP': 'the responsible party', 'XX': '$XX.00/40%'
        };

        const inputMap = {
            'input-name': 'N', 'input-title': 'CT', 'input-company-name': 'CN',
            'input-company-industry': 'CI', 'input-benefit': 'SB', 'input-pain': 'PP'
        };

        // Script State
        let currentStep = 'start';
        let history = [];

        // Script Data (consolidated)
        const scriptData = {
            start: {
                you: "Click 'Dial' to begin the call",
                mood: "neutral",
                responses: []
            },
            dialing: {
                you: "Dialing... Ringing...",
                mood: "neutral",
                responses: [
                    { text: "📞 Call Connected", next: "hook" },
                    { text: "📞 Transferred - Decision Maker Answers", next: "main_script_start" },
                    { text: "🚫 No Answer", next: "voicemail_or_hangup" }
                ]
            },
            voicemail_or_hangup: {
                you: "Call ended - No answer received.",
                mood: "neutral",
                responses: [
                    { text: "📧 Leave Voicemail", next: "voicemail" },
                    { text: "🔄 Start New Call", next: "start" }
                ]
            },
            hook: {
                you: "Hi, is this <strong>[N]</strong>?",
                mood: "neutral",
                responses: [
                    { text: "✅ Yes, this is [N]", next: "main_script_start" },
                    { text: "🗣️ Speaking", next: "main_script_start" },
                    { text: "❓ Who's calling?", next: "main_script_start" },
                    { text: "👥 Gatekeeper / Not the right person", next: "gatekeeper_intro" }
                ]
            },
            main_script_start: {
                you: "Good mornin'/afternoon, <strong>[N]</strong>! This is <strong>[YN]</strong> <span class='pause'>--</span> and I'm needin' to speak with someone over electricity agreements and contracts for <strong>[CN]</strong> would that be yourself?",
                mood: "neutral",
                responses: [
                    { text: "✅ Yes, that's me / I handle that", next: "pathA" },
                    { text: "👥 That would be [OP] / Not the right person", next: "gatekeeper_intro" },
                    { text: "🤝 We both handle it / Team decision", next: "pathA" },
                    { text: "🤔 Unsure or hesitant", next: "pathD" }
                ]
            },
            gatekeeper_intro: {
                you: "Good afternoon/morning. I'm needin' to speak with someone over electricity agreements and contracts for <strong>[CN]</strong> do you know who would be responsible for that?",
                mood: "neutral",
                responses: [
                    { text: "❓ What's this about?", next: "gatekeeper_whats_about" },
                    { text: "🔗 I'll connect you", next: "transfer_dialing" },
                    { text: "🚫 They're not available / Take a message", next: "voicemail" }
                ]
            },
            voicemail: {
                you: "Good afternoon/morning <strong>[N]</strong>, this is Lewis and I was told to speak with you. You can give me a call at 817-409-4215. Also, I shot you over a short email kinda explaining why I'm reaching out to you today. The email should be coming from Lewis Patterson that's (L.E.W.I.S) Thank you so much and you have a great day.",
                mood: "neutral",
                responses: [{ text: "🔄 End Call / Start New Call", next: "start" }]
            },
            pathA: {
                you: "Perfect <span class='pause'>--</span> So <strong>[N]</strong> I've been working closely with <strong>[CI]</strong> across Texas with electricity agreements <span class='pause'>--</span> and we're about to see an unprecedented dip in the market in the next few months <span class='pause'>--</span><br><br><strong><span class='emphasis'>Is getting the best price for your next renewal a priority for you and [CN]?</span></strong><br><br><strong><span class='emphasis'>Do you know when your contract expires?</span></strong>",
                mood: "neutral",
                responses: [
                    { text: "😰 Struggling / It's tough", next: "discovery" },
                    { text: "📅 Haven't renewed / Contract not up yet", next: "discovery" },
                    { text: "🔒 Locked in / Just renewed", next: "discovery" },
                    { text: "🛒 Shopping around / Looking at options", next: "discovery" },
                    { text: "🤝 Have someone handling it / Work with broker", next: "discovery" },
                    { text: "🤷 Haven't thought about it / It is what it is", next: "discovery" }
                ]
            },
            discovery: {
                you: "Gotcha! So <strong>[N]</strong>, Just so I understand your situation a little better. <span class='pause'>--</span> What's your current approach to renewing your electricity agreements <span class='pause'>--</span> do you handle it internally or work with a consultant?",
                mood: "neutral",
                responses: [
                    { text: "💚 Prospect is engaged / ready for appointment", next: "closeForAppointment" },
                    { text: "🟡 Prospect is hesitant / needs more info", next: "handleHesitation" },
                    { text: "❌ Objection: Happy with current provider", next: "objHappy" },
                    { text: "❌ Objection: No time", next: "objNoTime" }
                ]
            },
            closeForAppointment: {
                you: "Awesome! So, <strong>[N]</strong><span class='pause'>--</span> I really believe you'll be able to benefit from <span class='emphasis'>[SB]</span> that way you won't have to <span class='emphasis'>[PP]</span>. Our process is super simple! We start with an <span class='emphasis'>energy health check</span> where I look at your usage, contract terms, and then we can talk about what options might look like for <strong>[CN]</strong> moving forward.",
                mood: "positive",
                responses: [
                    { text: "📅 Schedule Friday 11 AM", next: "callSuccess" },
                    { text: "📅 Schedule Monday 2 PM", next: "callSuccess" },
                    { text: "🤔 Still hesitant", next: "handleHesitation" }
                ]
            },
            handleHesitation: {
                you: "I get it <span class='pause'>--</span> And called you out the blue so now is probably not the best time. How about this <span class='pause'>--</span> let me put together a quick case study specific to <span class='emphasis'>[TIA]</span>s in your area.",
                mood: "unsure",
                responses: [
                    { text: "✅ Yes, send analysis", next: "callSuccess" },
                    { text: "❌ No, not interested", next: "softClose" }
                ]
            },
            objHappy: {
                you: "That's actually great to hear, and I'm not suggesting you should be unhappy or you need to switch your supplier today. Is it the customer service that you're happy with or are you just getting a rate that you can't find anywhere else?",
                mood: "positive",
                responses: [
                    { text: "✅ Yes, worth understanding", next: "closeForAppointment" },
                    { text: "❌ No, not interested", next: "softClose" }
                ]
            },
            objNoTime: {
                you: "I completely get it <span class='pause'>--</span> that's exactly why most businesses end up overpaying. Energy is a complicated market that requires ongoing attention that most internal teams <span class='pause'>--</span> simply don't have time for.",
                mood: "challenging",
                responses: [
                    { text: "✅ Yes, schedule 10-minute assessment", next: "callSuccess" },
                    { text: "❌ Still no time", next: "softClose" }
                ]
            },
            softClose: {
                you: "No problem at all <span class='pause'>--</span> I know energy strategy isn't urgent until it becomes critical. Here's what I'll do: I'm going to add you to my <span class='emphasis'>quarterly market intelligence updates</span>.",
                mood: "neutral",
                responses: [
                    { text: "✅ That sounds reasonable", next: "callSuccess" },
                    { text: "❌ No thanks", next: "callEnd" }
                ]
            },
            callSuccess: {
                you: "🎉 <strong>Call Completed Successfully!</strong><br><br>Remember to track:<br>• Decision maker level<br>• Current contract status<br>• Pain points identified<br>• Interest level<br>• Next action committed",
                mood: "positive",
                responses: [{ text: "🔄 Start New Call", next: "start", action: "saveProspectAndNotes" }]
            },
            callEnd: {
                you: "Thanks for your time. Have a great day!",
                mood: "neutral",
                responses: [{ text: "🔄 Start New Call", next: "start" }]
            }
        };

        // Core Functions
        function handleEditableFocus(input) {
            if (currentProspect.contactId) {
                const lockedFields = ['input-company-name', 'input-name', 'input-title'];
                if (lockedFields.includes(input.id)) return;
            }
            if (input.value === input.placeholder || input.classList.contains('editable-locked')) {
                input.value = '';
                input.classList.remove('editable-locked');
            }
        }

        function populateFromGlobalProspect() {
            const fields = [
                { id: 'input-name', key: 'N', value: currentProspect.name },
                { id: 'input-title', key: 'CT', value: currentProspect.title },
                { id: 'input-company-name', key: 'CN', value: currentProspect.company },
                { id: 'input-company-industry', key: 'CI', value: currentProspect.industry },
                { id: 'input-benefit', key: 'SB', value: currentProspect.benefits },
                { id: 'input-pain', key: 'PP', value: currentProspect.painPoints }
            ];

            fields.forEach(field => {
                const input = gId(field.id);
                if (input) {
                    input.value = field.value || '';
                    placeholders[field.key] = field.value || '';
                }
            });
            placeholders['TIA'] = placeholders['CI'];

            if (currentProspect.contactId) {
                ['input-company-name', 'input-name', 'input-title'].forEach(fieldId => {
                    const input = gId(fieldId);
                    if (input) {
                        input.disabled = true;
                        input.style.backgroundColor = '#f8fafc';
                        input.style.cursor = 'not-allowed';
                    }
                });
            }
        }

        function updateScript() {
            for (const inputId in inputMap) {
                const placeholderKey = inputMap[inputId];
                const inputElement = gId(inputId);
                if (inputElement) {
                    const inputValue = inputElement.value || inputElement.placeholder;
                    placeholders[placeholderKey] = inputValue;
                }
            }
            placeholders['TIA'] = placeholders['CI'];
            displayCurrentStep();
        }

        function applyPlaceholders(text) {
            let newText = text;
            for (const key in placeholders) {
                const regex = new RegExp('\\[' + key + '\\]', 'g');
                let replacement = placeholders[key];
                
                // For name placeholder, use only first name
                if (key === 'N' && replacement) {
                    replacement = replacement.split(' ')[0];
                }
                
                newText = newText.replace(regex, replacement);
            }
            return newText;
        }

        function displayCurrentStep() {
            const step = scriptData[currentStep];
            if (!step) return;
            
            const scriptDisplay = gId('script-display');
            const responsesContainer = gId('responses-container');
            const backBtn = gId('back-btn');
            
            const processedText = applyPlaceholders(step.you);
            
            if (scriptDisplay) {
                scriptDisplay.innerHTML = processedText;
                scriptDisplay.className = `script-display mood-${step.mood}`;
            }
            
            if (responsesContainer) {
                responsesContainer.innerHTML = '';
                if (currentStep === 'start') {
                    const dialButtonHtml = `
                        <button class="dial-button" onclick="handleDialClick()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02L6.62 10.79z"/>
                            </svg>
                            Dial
                        </button>
                    `;
                    responsesContainer.innerHTML = dialButtonHtml;
                    responsesContainer.classList.add('single-button');
                } else if (step.responses && step.responses.length > 0) {
                    step.responses.forEach(response => {
                        const button = document.createElement('button');
                        button.className = 'response-btn';
                        button.innerHTML = applyPlaceholders(response.text);
                        button.onclick = () => selectResponse(response.next, response.action);
                        responsesContainer.appendChild(button);
                    });
                }
            }
            
            if (backBtn) {
                backBtn.disabled = history.length === 0;
            }
        }

        function handleDialClick() {
            const dialButton = document.querySelector('.dial-button');
            
            if (currentProspect.phone) {
                showToast(`Dialing ${currentProspect.phone}...`, 'info');
            } else {
                showToast('No phone number available for this prospect. Manual dialing is required.', 'info');
            }
            
            // Add ringing animation
            if (dialButton) {
                dialButton.classList.add('ringing');
                dialButton.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02L6.62 10.79z"/>
                    </svg>
                    Ringing...
                `;
                
                // After 3 seconds, proceed to next step
                setTimeout(() => {
                    dialButton.classList.remove('ringing');
                    selectResponse('dialing');
                }, 3000);
            } else {
                // Fallback if button not found
                setTimeout(() => {
                    selectResponse('dialing');
                }, 3000);
            }
        }

        function selectResponse(nextStep, action) {
            if (nextStep && scriptData[nextStep]) {
                history.push(currentStep);
                currentStep = nextStep;
                displayCurrentStep();
            }
            if (action === 'saveProspectAndNotes') {
                saveProspectAndNotes();
            }
        }

        function goBack() {
            if (history.length > 0) {
                currentStep = history.pop();
                displayCurrentStep();
            }
        }

        function restart() {
            currentStep = 'start';
            history = [];
            const callNotesElement = gId('call-notes');
            if (callNotesElement) callNotesElement.value = '';
            
            if (!currentProspect.contactId) {
                currentProspect = {
                    name: '', title: '', company: '', industry: '', phone: '', email: '',
                    accountId: '', contactId: '', painPoints: '', benefits: ''
                };
                ['input-name', 'input-title', 'input-company-name', 'input-company-industry', 'input-benefit', 'input-pain'].forEach(inputId => {
                    const input = gId(inputId);
                    if (input) {
                        input.value = '';
                        input.disabled = false;
                        input.classList.remove('editable-locked');
                        input.style.backgroundColor = '';
                        input.style.color = '';
                        input.style.cursor = '';
                    }
                });
            }
            displayCurrentStep();
        }
        
        function clearNotes() {
            const notesTextarea = gId('call-notes');
            if (!notesTextarea) return;
            if (window.confirm('Are you sure you want to clear all notes?')) {
                notesTextarea.value = '';
                showToast('Notes cleared.', 'warning');
            }
        }

        // Utility Functions
        function showLoading(show) {
            const overlay = gId('loading-overlay');
            if (overlay) {
                overlay.classList.toggle('active', show);
            }
        }

        function showToast(message, type = 'success') {
            const container = gId('toast-container');
            if (!container) return;
            
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `<div class="toast-message">${message}</div>`;
            container.appendChild(toast);
            
            setTimeout(() => toast.classList.add('show'), 100);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (container.contains(toast)) {
                        container.removeChild(toast);
                    }
                }, 300);
            }, 3000);
        }

        function formatDate(timestamp) {
            if (!timestamp) return 'Unknown date';
            try {
                const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } catch (e) {
                return 'Invalid date';
            }
        }

        // Search Functions
        function setupSearchFunctionality() {
            // External search buttons are handled in setupNavigation()
            // This function now focuses on search input functionality

            // Search input functionality

            ['search-input', 'search-city', 'search-state', 'search-company', 'search-industry', 'search-keyword'].forEach(id => {
                const input = gId(id);
                if (input) {
                    input.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') performSearch();
                    });
                    if (id === 'search-input') {
                        input.addEventListener('input', function(e) {
                            if (currentSearchType === 'accounts' || currentSearchType === 'contacts') {
                                performInternalSearch(e.target.value);
                            }
                        });
                    }
                }
            });
        }

        function openSearch(type, event) {
            try {
                const button = event.target.closest('.app-button') || event.target.closest('.sidebar-item');
                const searchBar = gId('search-bar');
                const mainContainer = gId('main-container');

                if (!searchBar || !mainContainer) {
                    showToast('Search interface not available', 'error');
                    return;
                }

                if (currentSearchType === type && activeButton === button) {
                    closeSearch();
                    return;
                }
                
                if (activeButton) activeButton.classList.remove('active');
                currentSearchType = type;
                activeButton = button;
                if (button) button.classList.add('active');
            } catch (error) {
                console.error('Error opening search:', error);
                showToast('Error opening search interface', 'error');
                return;
            }
            
            const label = gId('search-label');
            const input = gId('search-input');
            const cityInput = gId('search-city');
            const stateInput = gId('search-state');
            const locationInput = gId('search-location');
            const resultsDiv = gId('search-results');
            
            if (!label || !input) return;
            
            [cityInput, stateInput, locationInput].forEach(inp => {
                if (inp) inp.style.display = 'none';
            });
            if (resultsDiv) resultsDiv.classList.remove('active');
            
            const searchConfigs = {
                google: { label: 'Search Google:', placeholder: 'Type your search query...' },
                maps: { label: 'Search Maps:', placeholder: 'Search places, addresses, businesses...' },
                beenverified: {
                    label: 'Search BeenVerified:',
                    placeholder: 'Enter full name (e.g. John Smith)...',
                    extras: [cityInput, stateInput],
                    showRow2: false
                },
                apollo: {
                    label: 'Search Apollo:',
                    placeholder: 'Enter name (e.g. Lewis Patterson)...',
                    extras: [gId('search-company'), gId('search-industry'), gId('search-keyword')],
                    showRow2: true
                },
                accounts: { label: 'Search Accounts:', placeholder: 'Type to search accounts...', showResults: true },
                contacts: { label: 'Search Contacts:', placeholder: 'Type to search contacts...', showResults: true }
            };

            const config = searchConfigs[type];
            if (config) {
                label.textContent = config.label;
                input.placeholder = config.placeholder;
                
                // Show/hide row 2 for Apollo
                const row2 = gId('search-row-2');
                if (row2) {
                    row2.style.display = config.showRow2 ? 'flex' : 'none';
                }
                
                if (config.extras) {
                    config.extras.forEach(inp => {
                        if (inp) inp.style.display = 'block';
                    });
                }
                if (config.showResults && resultsDiv) {
                    resultsDiv.classList.add('active');
                }
            }
            
            if (searchBar && mainContainer) {
                searchBar.classList.add('active');
                mainContainer.classList.add('search-active');
                setTimeout(() => {
                    if (input) {
                        input.focus();
                        input.value = '';
                    }
                }, 300);
                [cityInput, stateInput, locationInput].forEach(inp => {
                    if (inp) inp.value = '';
                });
            }
        }

        function performInternalSearch(query) {
            const resultsDiv = gId('search-results');
            if (!resultsDiv || query.length < 2) {
                if (resultsDiv) resultsDiv.innerHTML = '';
                return;
            }
            
            let results = [];
            const searchQuery = query.toLowerCase();
            
            if (currentSearchType === 'accounts') {
                results = CRMApp.accounts
                    .filter(account => 
                        account.name?.toLowerCase().includes(searchQuery) ||
                        account.industry?.toLowerCase().includes(searchQuery)
                    )
                    .slice(0, 5)
                    .map(account => ({
                        id: account.id,
                        name: account.name,
                        info: account.industry || 'No Industry',
                        type: 'Account'
                    }));
            } else if (currentSearchType === 'contacts') {
                results = CRMApp.contacts
                    .filter(contact => 
                        `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(searchQuery) ||
                        contact.title?.toLowerCase().includes(searchQuery) ||
                        contact.accountName?.toLowerCase().includes(searchQuery)
                    )
                    .slice(0, 5)
                    .map(contact => ({
                        id: contact.id,
                        name: `${contact.firstName} ${contact.lastName}`,
                        info: `${contact.title || 'No Title'} at ${contact.accountName || 'No Account'}`,
                        type: 'Contact'
                    }));
            }
            
            let html = '';
            results.forEach(result => {
                html += `
                    <div class="search-result-item" onclick="handleSearchResultClick('${result.id}', '${currentSearchType}')">
                        <div class="search-result-name">${result.name}</div>
                        <div class="search-result-info">${result.info} <span class="search-result-type">${result.type}</span></div>
                    </div>
                `;
            });
            
            if (results.length > 0) {
                html += `<button class="view-all-btn" onclick="handleViewAll('${currentSearchType}')">View All ${currentSearchType === 'accounts' ? 'Accounts' : 'Contacts'}</button>`;
            } else {
                html = `<div class="search-result-item">No ${currentSearchType} found</div>`;
            }
            
            resultsDiv.innerHTML = html;
        }

        function handleSearchResultClick(id, type) {
            if (type === 'accounts') {
                showAccountDetail(id);
            } else if (type === 'contacts') {
                const contact = CRMApp.contacts.find(c => c.id === id);
                if (contact && contact.accountId) {
                    showAccountDetail(contact.accountId);
                } else {
                    showToast('This contact is not linked to an account.', 'warning');
                }
            }
            closeSearch();
        }

        function handleViewAll(type) {
            closeSearch();
            showView(type);
        }

        function closeSearch() {
            const searchBar = gId('search-bar');
            const mainContainer = gId('main-container');
            const resultsDiv = gId('search-results');
            const leftSidebar = gId('left-sidebar');
            const topNav = gId('top-nav');
            const indicator = gId('search-type-indicator');
            
            if (searchBar) searchBar.classList.remove('active');
            if (mainContainer) mainContainer.classList.remove('search-active');
            if (resultsDiv) {
                resultsDiv.classList.remove('active');
                resultsDiv.innerHTML = '';
            }
            if (activeButton) {
                activeButton.classList.remove('active');
                activeButton = null;
            }
            if (indicator) indicator.style.display = 'none';
            
            // Restore sidebar
            if (leftSidebar) leftSidebar.style.transform = '';
            if (topNav) topNav.style.left = '60px';
            if (mainContainer) mainContainer.style.marginLeft = '60px';
            
            currentSearchType = '';
        }

        function performSearch() {
            try {
                const searchInput = gId('search-input');
                if (!searchInput) {
                    showToast('Search input not found', 'error');
                    return;
                }

                const query = searchInput.value.trim();
                
                if (!query) {
                    showToast('Please enter a search query', 'warning');
                    return;
                }
                
                if (currentSearchType === 'accounts' || currentSearchType === 'contacts') return;
                
                const searchUrls = {
                google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                maps: `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
                
                apollo: (() => {
                    const name = query;
                    const city = gId('search-city').value.trim();
                    const state = gId('search-state').value.trim();
                    const company = gId('search-company').value.trim();
                    const industry = gId('search-industry').value.trim();
                    const keyword = gId('search-keyword').value.trim();
                    
                    // Default to companies search as shown in your example
                    let url = 'https://app.apollo.io/#/companies?';
                    let params = new URLSearchParams();
                    
                    // Add standard parameters
                    params.append('sortAscending', 'false');
                    params.append('sortByField', '[none]');
                    params.append('page', '1');
                    
                    // Add organization name if provided
                    if (name || company) {
                        params.append('qOrganizationName', name || company);
                    }
                    
                    // Add location (state, city format like "Texas, US")
                    if (state) {
                        const location = city ? `${city}, ${state}, US` : `${state}, US`;
                        params.append('organizationLocations[]', location);
                    }
                    
                    // Add industry keywords
                    if (industry || keyword) {
                        const keywords = [industry, keyword].filter(k => k).join(' ');
                        params.append('qOrganizationKeywordTags[]', keywords);
                    }
                    
                    return url + params.toString();
                })(),
                
                beenverified: (() => {
                    const fullName = query;
                    const city = gId('search-city').value.trim();
                    const state = gId('search-state').value.trim().toUpperCase();
                    
                    // Parse name into first and last
                    const nameParts = fullName.split(' ');
                    const firstName = nameParts[0] || '';
                    const lastName = nameParts.slice(1).join(' ') || '';
                    
                    // Build URL exactly like your example
                    const params = new URLSearchParams();
                    params.append('age', '0');
                    params.append('city', city);
                    params.append('fullname', fullName);
                    params.append('fname', firstName);
                    params.append('ln', lastName);
                    params.append('mn', ''); // middle name empty
                    params.append('state', state);
                    params.append('title', '');
                    params.append('company', '');
                    params.append('industry', '');
                    params.append('level', '');
                    params.append('companySizeMin', '1');
                    params.append('companSizeMax', '9');
                    params.append('birthMonth', '');
                    params.append('birthYear', '');
                    params.append('deathMonth', '');
                    params.append('deathYear', '');
                    params.append('address', '');
                    params.append('isDeceased', 'false');
                    params.append('location', '');
                    params.append('country', '');
                    params.append('advancedSearch', 'true');
                    params.append('eventType', 'none');
                    params.append('eventMonth', '');
                    params.append('eventYear', '');
                    params.append('source', 'personSearch,familySearch,obituarySearch,deathIndexSearch,contactSearch');
                    
                    return `https://www.beenverified.com/rf/search/v2?${params.toString()}`;
                })()
            };
            
            const searchUrl = searchUrls[currentSearchType];
            if (searchUrl) {
                try {
                    window.open(searchUrl, '_blank');
                    showToast(`Opening ${currentSearchType} search in new tab`, 'info');
                    closeSearch();
                } catch (error) {
                    console.error('Error opening search URL:', error);
                    showToast('Error opening search. Please check your popup blocker settings.', 'error');
                }
            } else {
                showToast('Search type not supported', 'error');
            }
            } catch (error) {
                console.error('Error performing search:', error);
                showToast('Error performing search', 'error');
            }
        }

        // Navigation Functions
        function setupNavigation() {
            // Setup sidebar navigation
            const sidebarItems = document.querySelectorAll('.sidebar-item[data-view]');
            sidebarItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = item.getAttribute('data-view');
                    
                    // Update active state
                    document.querySelectorAll('.sidebar-item').forEach(si => si.classList.remove('active'));
                    item.classList.add('active');
                    
                    if (view === 'calls-hub') {
                        openCallsHubWithData();
                    } else {
                        showView(view);
                    }
                });
            });

            // Setup search functions
            const searchAccounts = gId('sidebar-search-accounts');
            const searchContacts = gId('sidebar-search-contacts');
            
            if (searchAccounts) {
                searchAccounts.addEventListener('click', (e) => {
                    e.preventDefault();
                    openSearch('accounts', e);
                });
            }
            
            if (searchContacts) {
                searchContacts.addEventListener('click', (e) => {
                    e.preventDefault();
                    openSearch('contacts', e);
                });
            }

            // Setup external tools
            const externalTools = [
                { id: 'sidebar-google', type: 'google' },
                { id: 'sidebar-maps', type: 'maps' },
                { id: 'sidebar-apollo', type: 'apollo' },
                { id: 'sidebar-beenverified', type: 'beenverified' }
            ];

            externalTools.forEach(tool => {
                const element = gId(tool.id);
                if (element) {
                    element.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openSearch(tool.type, e);
                    });
                }
            });

            // Setup main search bar
            const navSearchInput = gId('nav-search-input');
            if (navSearchInput) {
                navSearchInput.addEventListener('input', function(e) {
                    performGlobalSearch(e.target.value);
                });
                navSearchInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        performGlobalSearch(e.target.value);
                    }
                });
            }

            gId('go-to-calls-hub-btn').addEventListener('click', (e) => {
                e.preventDefault();
                openCallsHubWithData();
            });
        }

        // Enhanced global search function with phone/city/state support
        function performGlobalSearch(query) {
            const resultsDiv = gId('nav-search-results');
            if (!query || query.length < 2) {
                if (resultsDiv) {
                    resultsDiv.innerHTML = '';
                    resultsDiv.classList.remove('active');
                }
                return;
            }
            
            const searchQuery = query.toLowerCase();
            let results = [];
            
            // Enhanced phone number detection - supports numbers with or without dashes/formatting
            const phoneRegex = /[\d\-\(\)\s\+\.]{7,}/;
            const isPhoneSearch = phoneRegex.test(query) || /^\d{10,}$/.test(query.replace(/\D/g, ''));
            const cleanQuery = query.replace(/\D/g, ''); // Remove all non-digits for phone comparison
            
            // Search accounts
            const accountResults = CRMApp.accounts
                .filter(account => {
                    const nameMatch = account.name?.toLowerCase().includes(searchQuery);
                    const industryMatch = account.industry?.toLowerCase().includes(searchQuery);
                    const cityMatch = account.city?.toLowerCase().includes(searchQuery);
                    const stateMatch = account.state?.toLowerCase().includes(searchQuery);
                    
                    // Enhanced phone matching - supports partial matches and different formats
                    let phoneMatch = false;
                    if (isPhoneSearch && account.phone && cleanQuery.length >= 3) {
                        const cleanPhone = account.phone.replace(/\D/g, '');
                        // Match if cleaned query is contained in phone or vice versa (for partial searches)
                        phoneMatch = cleanPhone.includes(cleanQuery) ||
                                   cleanQuery.includes(cleanPhone) ||
                                   // Support partial matching from the beginning of the number
                                   cleanPhone.startsWith(cleanQuery) ||
                                   // Support matching last digits (useful for extensions)
                                   cleanPhone.endsWith(cleanQuery);
                    }
                    
                    return nameMatch || industryMatch || cityMatch || stateMatch || phoneMatch;
                })
                .slice(0, 3)
                .map(account => ({
                    id: account.id,
                    name: account.name,
                    info: `${account.industry || 'No Industry'} • ${account.city || ''} ${account.state || ''}`.trim(),
                    phone: account.phone,
                    type: 'Account'
                }));
            
            // Search contacts
            const contactResults = CRMApp.contacts
                .filter(contact => {
                    const nameMatch = `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(searchQuery);
                    const titleMatch = contact.title?.toLowerCase().includes(searchQuery);
                    const accountMatch = contact.accountName?.toLowerCase().includes(searchQuery);
                    
                    // Enhanced phone matching - supports partial matches and different formats
                    let phoneMatch = false;
                    if (isPhoneSearch && contact.phone && cleanQuery.length >= 3) {
                        const cleanPhone = contact.phone.replace(/\D/g, '');
                        // Match if cleaned query is contained in phone or vice versa (for partial searches)
                        phoneMatch = cleanPhone.includes(cleanQuery) ||
                                   cleanQuery.includes(cleanPhone) ||
                                   // Support partial matching from the beginning of the number
                                   cleanPhone.startsWith(cleanQuery) ||
                                   // Support matching last digits (useful for extensions)
                                   cleanPhone.endsWith(cleanQuery);
                    }
                    
                    return nameMatch || titleMatch || accountMatch || phoneMatch;
                })
                .slice(0, 3)
                .map(contact => ({
                    id: contact.id,
                    name: `${contact.firstName} ${contact.lastName}`,
                    info: `${contact.title || 'No Title'} at ${contact.accountName || 'No Account'}`,
                    phone: contact.phone,
                    type: 'Contact'
                }));
            
            results = [...accountResults, ...contactResults];
            
            if (!resultsDiv) return;
            
            if (results.length === 0) {
                resultsDiv.innerHTML = '<div class="nav-search-result">No results found</div>';
                resultsDiv.classList.add('active');
                return;
            }
            
            let html = '';
            results.forEach(result => {
                html += `
                    <div class="nav-search-result" onclick="handleGlobalSearchClick('${result.id}', '${result.type.toLowerCase()}')">
                        <div class="nav-search-result-info">
                            <div class="nav-search-result-name">${result.name}</div>
                            <div class="nav-search-result-details">${result.info} • ${result.type}${result.phone ? ' • ' + result.phone : ''}</div>
                        </div>
                        <div class="nav-search-result-actions">
                            ${result.type === 'Contact' ? `<button class="nav-search-call-btn" onclick="event.stopPropagation(); openCallsHubWithData('${result.id}')">Call</button>` : ''}
                        </div>
                    </div>
                `;
            });
            
            resultsDiv.innerHTML = html;
            resultsDiv.classList.add('active');
        }

        function handleGlobalSearchClick(id, type) {
            if (type === 'account') {
                showAccountDetail(id);
            } else if (type === 'contact') {
                const contact = CRMApp.contacts.find(c => c.id === id);
                if (contact && contact.accountId) {
                    showAccountDetail(contact.accountId);
                } else {
                    showToast('This contact is not linked to an account.', 'warning');
                }
            }
            
            // Clear search results
            const resultsDiv = gId('nav-search-results');
            if (resultsDiv) {
                resultsDiv.classList.remove('active');
                resultsDiv.innerHTML = '';
            }
            const searchInput = gId('nav-search-input');
            if (searchInput) searchInput.value = '';
        }

        function showView(viewName) {
            const currentActiveView = document.querySelector('.view-container.active');
            const targetView = gId(viewName + '-view');
            
            if (!targetView) return;
            
            // If there's a current view, fade it out first
            if (currentActiveView && currentActiveView !== targetView) {
                currentActiveView.classList.add('fade-out');
                
                // Wait for fade out animation to complete
                setTimeout(() => {
                    currentActiveView.classList.remove('active', 'fade-out');
                    
                    // Show new view with slide-in animation
                    targetView.classList.add('active');
                    CRMApp.currentView = viewName;
                    updateActiveNavButton(viewName);
                    updatePageTitle(viewName);
                    loadViewData(viewName);
                }, 300);
            } else {
                // No current view, show immediately
                document.querySelectorAll('.view-container').forEach(view => {
                    view.classList.remove('active', 'fade-out');
                });
                targetView.classList.add('active');
                CRMApp.currentView = viewName;
                updateActiveNavButton(viewName);
                updatePageTitle(viewName);
                loadViewData(viewName);
            }
        }
        
        function updateActiveNavButton(viewName) {
            document.querySelectorAll('.sidebar-item').forEach(item => {
                item.classList.remove('active');
            });
            const activeItem = gId(`sidebar-${viewName}`);
            if (activeItem) activeItem.classList.add('active');
        }

        function updatePageTitle(viewName) {
            const titles = {
                'dashboard': 'Power Choosers CRM Dashboard',
                'accounts': 'Power Choosers CRM Accounts',
                'contacts': 'Power Choosers CRM Contacts', 
                'account-detail': 'Power Choosers CRM Account Details',
                'calls-hub': 'Power Choosers Cold Calling Hub'
            };
            const titleElement = gId('page-title');
            if (titleElement) {
                titleElement.textContent = titles[viewName] || 'Power Choosers CRM';
            }
        }

        function loadViewData(viewName) {
            const loadActions = {
                'dashboard': () => { renderDashboard(); renderRecentActivities(); },
                'accounts': () => renderAccounts(),
                'contacts': () => renderContacts(),
                'account-detail': () => { if (CRMApp.currentAccount) renderAccountDetail(); },
                'calls-hub': () => initializeCallsHub()
            };
            
            if (loadActions[viewName]) {
                loadActions[viewName]();
            }
        }

        function initializeCallsHub() {
            if (!currentProspect.name && !currentProspect.company) {
                currentProspect = {
                    name: '', title: '', company: '', industry: '', phone: '', email: '',
                    accountId: '', contactId: '', painPoints: '', benefits: ''
                };
            }
            populateFromGlobalProspect();
            displayCurrentStep();
        }

        // Data Functions
        async function loadInitialData() {
            showLoading(true);
            try {
                const [accountsSnapshot, contactsSnapshot, activitiesSnapshot] = await Promise.all([
                    db.collection('accounts').get(),
                    db.collection('contacts').get(),
                    db.collection('activities').orderBy('createdAt', 'desc').limit(20).get()
                ]);
                
                CRMApp.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                CRMApp.contacts = contactsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                CRMApp.activities = activitiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                renderDashboard();
                renderAccounts();
                renderContacts();
                updateContactAccountDropdown();
                renderRecentActivities();
                
            } catch (error) {
                console.error('Error loading initial data:', error);
                showToast('Error loading data.', 'error');
            } finally {
                showLoading(false);
            }
        }

        async function logActivity(activityData) {
            try {
                await db.collection('activities').add({
                    ...activityData,
                    createdAt: serverTimestamp()
                });
            } catch (error) {
                console.error('Error logging activity:', error);
            }
        }

        async function saveProspectAndNotes() {
            const notesContent = gId('call-notes').value.trim();
            const prospectData = {
                name: gId('input-name').value.trim(),
                title: gId('input-title').value.trim(),
                company: gId('input-company-name').value.trim(),
                industry: gId('input-company-industry').value.trim(),
                benefits: gId('input-benefit').value.trim(),
                painPoints: gId('input-pain').value.trim()
            };

            showLoading(true);
            try {
                let { accountId, contactId } = currentProspect;
                let isNewAccount = false, isNewContact = false;

                // Handle account creation/update
                if (accountId && prospectData.company) {
                    await db.collection('accounts').doc(accountId).update({
                        name: prospectData.company,
                        industry: prospectData.industry,
                        painPoints: prospectData.painPoints,
                        benefits: prospectData.benefits,
                        updatedAt: serverTimestamp()
                    });
                } else if (prospectData.company) {
                    const newAccountRef = await db.collection('accounts').add({
                        name: prospectData.company,
                        industry: prospectData.industry,
                        painPoints: prospectData.painPoints,
                        benefits: prospectData.benefits,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    accountId = newAccountRef.id;
                    isNewAccount = true;
                }

                // Handle contact creation/update
                if (contactId && prospectData.name) {
                    await db.collection('contacts').doc(contactId).update({
                        firstName: prospectData.name.split(' ')[0] || '',
                        lastName: prospectData.name.split(' ')[1] || '',
                        title: prospectData.title,
                        accountId: accountId,
                        accountName: prospectData.company,
                        notes: notesContent,
                        updatedAt: serverTimestamp()
                    });
                } else if (prospectData.name) {
                    const newContactRef = await db.collection('contacts').add({
                        firstName: prospectData.name.split(' ')[0] || '',
                        lastName: prospectData.name.split(' ')[1] || '',
                        title: prospectData.title,
                        accountId: accountId,
                        accountName: prospectData.company,
                        notes: notesContent,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    contactId = newContactRef.id;
                    isNewContact = true;
                }
                
                if (notesContent) {
                    await logActivity({
                        type: 'call_note',
                        description: `Call note for ${prospectData.name || prospectData.company || 'prospect'}`,
                        noteContent: notesContent,
                        accountId: accountId,
                        accountName: prospectData.company,
                        contactId: contactId,
                        contactName: prospectData.name
                    });
                }

                showToast(`Call notes saved!${isNewAccount ? ' New account created.' : ''}${isNewContact ? ' New contact created.' : ''}`);
                await loadInitialData();
                restart();

            } catch (error) {
                console.error('Error saving prospect and notes:', error);
                showToast('Error saving data.', 'error');
            } finally {
                showLoading(false);
            }
        }

        // Render Functions
        function renderDashboard() {
            if (gId('total-accounts')) gId('total-accounts').textContent = CRMApp.accounts.length;
            if (gId('total-contacts')) gId('total-contacts').textContent = CRMApp.contacts.length;
            if (gId('recent-activities')) gId('recent-activities').textContent = CRMApp.activities.length;
            if (gId('hot-leads')) gId('hot-leads').textContent = '0';
            renderDashboardContacts();
        }

        function renderRecentActivities() {
            const list = gId('recent-activities-list');
            if (!list) return;
            const recentActivities = CRMApp.activities.slice(0, 4);
            
            if (recentActivities.length === 0) {
                list.innerHTML = '<p class="empty-state">No recent activities</p>';
                return;
            }
            
            list.innerHTML = recentActivities.map(activity => `
                <div class="activity-item">
                    <div class="activity-title">${activity.description}</div>
                    <div class="activity-content">${activity.noteContent ? activity.noteContent.substring(0, 100) + '...' : ''}</div>
                    <div class="activity-date">Time: ${formatDate(activity.createdAt)}</div>
                </div>
            `).join('');
        }

        function renderDashboardContacts() {
            const container = gId('dashboard-contacts');
            if (!container) return;
            const recentContacts = CRMApp.contacts.slice(0, 5);
            
            if (recentContacts.length === 0) {
                container.innerHTML = '<p class="empty-state">No contacts to display</p>';
                return;
            }
            
            container.innerHTML = recentContacts.map(contact => `
                <div class="contact-item">
                    <div class="contact-item-info">
                        <div class="contact-item-name">${contact.firstName} ${contact.lastName}</div>
                        <div class="contact-item-detail">${contact.title || 'No Title'} • ${contact.accountName || 'No Account'}</div>
                    </div>
                    <div class="contact-item-actions">
                        <button class="mini-btn edit" onclick="openContactModal(CRMApp.contacts.find(c => c.id === '${contact.id}'))">Edit</button>
                        <button class="mini-btn delete" onclick="deleteContact('${contact.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        }

        function renderAccounts() {
            const tbody = gId('accounts-tbody');
            if (!tbody) return;
            
            if (CRMApp.accounts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No accounts found. Click "New Account" to get started.</td></tr>';
                return;
            }
            
            tbody.innerHTML = CRMApp.accounts.map(account => `
                <tr onclick="showAccountDetail('${account.id}')" style="cursor: pointer;">
                    <td><strong>${account.name}</strong></td>
                    <td>${account.industry || 'N/A'}</td>
                    <td>${account.phone || 'N/A'}</td>
                    <td>${account.city || 'N/A'}</td>
                    <td>${account.state || 'N/A'}</td>
                    <td onclick="event.stopPropagation()">
                        <div class="table-actions">
                            <button class="table-btn edit" onclick="openAccountModal(CRMApp.accounts.find(a => a.id === '${account.id}'))" title="Edit Account">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                    <path d="m15 5 4 4"/>
                                </svg>
                            </button>
                            <button class="table-btn delete" onclick="deleteAccount('${account.id}')" title="Delete Account">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3,6 5,6 21,6"/>
                                    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,2v2"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }

        function renderContacts() {
            const tbody = gId('contacts-tbody');
            if (!tbody) return;
            
            if (CRMApp.contacts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No contacts found. Click "New Contact" to get started.</td></tr>';
                return;
            }
            
            tbody.innerHTML = CRMApp.contacts.map(contact => `
                <tr onclick="handleContactClick('${contact.id}')" style="cursor: pointer;">
                    <td><strong>${contact.firstName} ${contact.lastName}</strong></td>
                    <td>${contact.title || 'N/A'}</td>
                    <td>${contact.accountName || 'N/A'}</td>
                    <td>${contact.email ? `<span class="clickable-email" onclick="event.stopPropagation(); openEmailCompose('${contact.email}', '${contact.firstName} ${contact.lastName}')">${contact.email}</span>` : 'N/A'}</td>
                    <td>${contact.phone || 'N/A'}</td>
                    <td onclick="event.stopPropagation()">
                        <div class="table-actions">
                            <button class="table-btn call" onclick="openCallsHubWithData('${contact.id}')" title="Call Contact">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                            </button>
                            <button class="table-btn edit" onclick="openContactModal(CRMApp.contacts.find(c => c.id === '${contact.id}'))" title="Edit Contact">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                    <path d="m15 5 4 4"/>
                                </svg>
                            </button>
                            <button class="table-btn delete" onclick="deleteContact('${contact.id}')" title="Delete Contact">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3,6 5,6 21,6"/>
                                    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,2v2"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }

        function handleContactClick(contactId) {
            const contact = CRMApp.contacts.find(c => c.id === contactId);
            if (contact) {
                showContactDetail(contactId);
            } else {
                showToast('Contact not found.', 'error');
            }
        }

        function showContactDetail(contactId) {
            CRMApp.currentContact = CRMApp.contacts.find(c => c.id === contactId);
            if (!CRMApp.currentContact) {
                showToast('Contact not found.', 'error');
                return;
            }
            showView('contact-detail');
            renderContactDetail();
        }

        function renderContactDetail() {
            if (!CRMApp.currentContact) return;
            const contact = CRMApp.currentContact;
            
            // Update contact header
            const contactLogo = document.getElementById('contact-logo');
            const contactInitials = document.getElementById('contact-initials');
            const contactName = document.getElementById('contact-name');
            const contactTitle = document.getElementById('contact-title');
            const contactCompany = document.getElementById('contact-company');
            
            if (contactInitials) {
                contactInitials.textContent = getContactInitials(contact.name);
            }
            if (contactName) {
                contactName.textContent = contact.name || 'Unknown Contact';
            }
            if (contactTitle) {
                contactTitle.textContent = contact.title || 'No title';
            }
            if (contactCompany) {
                const account = CRMApp.accounts.find(a => a.id === contact.accountId);
                contactCompany.textContent = account ? account.name : 'No company';
            }
            
            // Update contact information fields
            document.getElementById('contact-detail-name').textContent = contact.name || 'Unknown Contact';
            document.getElementById('contact-detail-title').textContent = contact.title || 'No title';
            document.getElementById('contact-email').textContent = contact.email || 'No email';
            document.getElementById('contact-detail-phone').textContent = contact.phone || 'No phone';
            document.getElementById('contact-detail-linkedin').textContent = contact.linkedin || 'Not provided';
            
            const account = CRMApp.accounts.find(a => a.id === contact.accountId);
            document.getElementById('contact-detail-company').textContent = account ? account.name : 'No company';
            
            // Show/hide LinkedIn button
            const linkedinBtn = document.getElementById('contact-linkedin-btn');
            if (linkedinBtn) {
                if (contact.linkedin) {
                    linkedinBtn.style.display = 'inline-flex';
                } else {
                    linkedinBtn.style.display = 'none';
                }
            }
            
            // Render energy health check for contact
            if (account) {
                performContactEnergyHealthCheck(account);
                renderContactContractDetails(account);
            }
            
            // Render notes and activities
            renderContactNotes(contact.id);
            renderContactActivities(contact.id);
        }

        function getContactInitials(name) {
            if (!name) return 'C';
            const parts = name.split(' ');
            if (parts.length >= 2) {
                return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
            }
            return name.charAt(0).toUpperCase();
        }

        // Contact Health Check Variables
        let contactCurrentCardIndex = 0;
        let contactHealthCheckData = [];

        function performContactEnergyHealthCheck(account) {
            if (!account) return;
            
            contactHealthCheckData = [];
            contactCurrentCardIndex = 0;
            
            // Use the same health check logic as accounts
            const currentRate = parseFloat(account.currentRate) || 0;
            const monthlyUsage = parseFloat(account.monthlyUsage) || 0;
            const contractEndDate = account.contractEndDate ? new Date(account.contractEndDate) : null;
            const deliveryCharge = parseFloat(account.deliveryCharge) || 0;
            
            // Calculate health metrics
            const today = new Date();
            const daysUntilExpiration = contractEndDate ? Math.ceil((contractEndDate - today) / (1000 * 60 * 60 * 24)) : null;
            const monthsUntilExpiration = daysUntilExpiration ? Math.ceil(daysUntilExpiration / 30) : null;
            
            // Market rate analysis
            const marketRate = 0.12; // Example market rate
            const totalCurrentCost = currentRate + deliveryCharge;
            const totalMarketCost = marketRate + deliveryCharge;
            const monthlySavingsPotential = (totalCurrentCost - totalMarketCost) * monthlyUsage;
            const annualSavingsPotential = monthlySavingsPotential * 12;
            
            // Contract Status Card
            let contractScore = 100;
            let contractStatus = 'Excellent';
            let contractMessage = 'Your contract is in good standing.';
            
            if (monthsUntilExpiration !== null) {
                if (monthsUntilExpiration <= 1) {
                    contractScore = 25;
                    contractStatus = 'Critical';
                    contractMessage = 'Contract expires very soon! Immediate action required.';
                } else if (monthsUntilExpiration <= 3) {
                    contractScore = 50;
                    contractStatus = 'Warning';
                    contractMessage = 'Contract expires soon. Start renewal process.';
                } else if (monthsUntilExpiration <= 6) {
                    contractScore = 75;
                    contractStatus = 'Good';
                    contractMessage = 'Contract expires in a few months. Plan ahead.';
                }
            }
            
            contactHealthCheckData.push({
                title: 'Contract Status',
                score: contractScore,
                status: contractStatus,
                message: contractMessage,
                details: contractEndDate ? `Expires: ${contractEndDate.toLocaleDateString()}` : 'No expiration date set'
            });
            
            // Rate Competitiveness Card
            let rateScore = 100;
            let rateStatus = 'Excellent';
            let rateMessage = 'Your rate is competitive.';
            
            if (totalCurrentCost > totalMarketCost * 1.2) {
                rateScore = 25;
                rateStatus = 'Poor';
                rateMessage = 'Your rate is significantly above market. Consider switching.';
            } else if (totalCurrentCost > totalMarketCost * 1.1) {
                rateScore = 50;
                rateStatus = 'Fair';
                rateMessage = 'Your rate is above market average.';
            } else if (totalCurrentCost > totalMarketCost) {
                rateScore = 75;
                rateStatus = 'Good';
                rateMessage = 'Your rate is slightly above market.';
            }
            
            contactHealthCheckData.push({
                title: 'Rate Competitiveness',
                score: rateScore,
                status: rateStatus,
                message: rateMessage,
                details: `Current: $${totalCurrentCost.toFixed(4)}/kWh | Market: $${totalMarketCost.toFixed(4)}/kWh`
            });
            
            // Savings Opportunity Card
            let savingsScore = annualSavingsPotential > 1000 ? 25 : annualSavingsPotential > 500 ? 50 : annualSavingsPotential > 100 ? 75 : 100;
            let savingsStatus = annualSavingsPotential > 1000 ? 'High Potential' : annualSavingsPotential > 500 ? 'Medium Potential' : annualSavingsPotential > 100 ? 'Low Potential' : 'Optimized';
            let savingsMessage = annualSavingsPotential > 100 ? 'Significant savings available!' : 'Your rates are well optimized.';
            
            contactHealthCheckData.push({
                title: 'Savings Opportunity',
                score: savingsScore,
                status: savingsStatus,
                message: savingsMessage,
                details: `Potential annual savings: $${Math.abs(annualSavingsPotential).toFixed(2)}`
            });
            
            // Update UI
            renderContactHealthCard();
            updateContactCardNavigation();
        }

        function renderContactHealthCard() {
            if (contactHealthCheckData.length === 0) return;
            
            const card = contactHealthCheckData[contactCurrentCardIndex];
            const healthCard = document.getElementById('contact-health-card');
            
            if (healthCard) {
                healthCard.innerHTML = `
                    <div class="card-header">
                        <h4>${card.title}</h4>
                        <div class="health-score ${card.status.toLowerCase().replace(' ', '-')}">
                            <span class="score-value">${card.score}</span>
                            <span class="score-label">Health Score</span>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="status-indicator ${card.status.toLowerCase().replace(' ', '-')}">
                            ${card.status}
                        </div>
                        <p class="card-message">${card.message}</p>
                        <p class="card-details">${card.details}</p>
                    </div>
                `;
            }
        }

        function updateContactCardNavigation() {
            const currentCardSpan = document.getElementById('contact-current-card');
            const totalCardsSpan = document.getElementById('contact-total-cards');
            const prevBtn = document.querySelector('#contact-health-check .nav-btn.prev');
            const nextBtn = document.querySelector('#contact-health-check .nav-btn.next');
            
            if (currentCardSpan) currentCardSpan.textContent = contactCurrentCardIndex + 1;
            if (totalCardsSpan) totalCardsSpan.textContent = contactHealthCheckData.length;
            
            if (prevBtn) prevBtn.disabled = contactCurrentCardIndex === 0;
            if (nextBtn) nextBtn.disabled = contactCurrentCardIndex === contactHealthCheckData.length - 1;
        }

        function nextContactHealthCard() {
            if (contactCurrentCardIndex < contactHealthCheckData.length - 1) {
                contactCurrentCardIndex++;
                renderContactHealthCard();
                updateContactCardNavigation();
            }
        }

        function prevContactHealthCard() {
            if (contactCurrentCardIndex > 0) {
                contactCurrentCardIndex--;
                renderContactHealthCard();
                updateContactCardNavigation();
            }
        }

        function renderContactContractDetails(account) {
            if (!account) return;
            
            document.getElementById('contact-current-rate').textContent = account.currentRate ? `$${account.currentRate}/kWh` : 'Not specified';
            document.getElementById('contact-contract-end').textContent = account.contractEndDate ? new Date(account.contractEndDate).toLocaleDateString() : 'Not specified';
            document.getElementById('contact-monthly-usage').textContent = account.monthlyUsage ? `${account.monthlyUsage} kWh` : 'Not specified';
            
            const currentRate = parseFloat(account.currentRate) || 0;
            const monthlyUsage = parseFloat(account.monthlyUsage) || 0;
            const deliveryCharge = parseFloat(account.deliveryCharge) || 0;
            const marketRate = 0.12;
            const totalCurrentCost = currentRate + deliveryCharge;
            const totalMarketCost = marketRate + deliveryCharge;
            const monthlySavingsPotential = (totalCurrentCost - totalMarketCost) * monthlyUsage;
            const annualSavingsPotential = monthlySavingsPotential * 12;
            
            document.getElementById('contact-annual-savings').textContent = `$${Math.abs(annualSavingsPotential).toFixed(2)} ${annualSavingsPotential >= 0 ? 'potential savings' : 'current savings'}`;
        }

        function renderContactNotes(contactId) {
            const notesList = document.getElementById('contact-notes-list');
            if (!notesList) return;
            
            const contactNotes = CRMApp.notes.filter(note => note.contactId === contactId);
            
            if (contactNotes.length === 0) {
                notesList.innerHTML = '<p class="empty-state">No notes for this contact</p>';
                return;
            }
            
            notesList.innerHTML = contactNotes.map(note => `
                <div class="note-item">
                    <div class="note-content">${note.content}</div>
                    <div class="note-date">${new Date(note.date).toLocaleDateString()}</div>
                </div>
            `).join('');
        }

        function renderContactActivities(contactId) {
            const activitiesList = document.getElementById('contact-activities-list');
            if (!activitiesList) return;
            
            const contact = CRMApp.contacts.find(c => c.id === contactId);
            let activities = CRMApp.activities.filter(activity => activity.contactId === contactId);
            
            // Include shared activities from linked account
            if (contact && contact.accountId) {
                const accountActivities = CRMApp.activities.filter(activity => activity.accountId === contact.accountId);
                activities = [...activities, ...accountActivities];
            }
            
            // Sort by date (newest first)
            activities.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            if (activities.length === 0) {
                activitiesList.innerHTML = '<p class="empty-state">No recent activities</p>';
                return;
            }
            
            activitiesList.innerHTML = activities.map(activity => `
                <div class="activity-item">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-content">${activity.content}</div>
                    <div class="activity-date">${new Date(activity.date).toLocaleDateString()}</div>
                </div>
            `).join('');
        }

        function addContactNote() {
            const noteInput = document.getElementById('contact-note-input');
            const noteContent = noteInput.value.trim();
            
            if (!noteContent) {
                showToast('Please enter a note.', 'warning');
                return;
            }
            
            if (!CRMApp.currentContact) {
                showToast('No contact selected.', 'error');
                return;
            }
            
            const newNote = {
                id: Date.now(),
                contactId: CRMApp.currentContact.id,
                content: noteContent,
                date: new Date().toISOString()
            };
            
            CRMApp.notes.push(newNote);
            
            // Also add to account notes if contact is linked to an account
            if (CRMApp.currentContact.accountId) {
                const accountNote = {
                    id: Date.now() + 1,
                    accountId: CRMApp.currentContact.accountId,
                    content: `[Contact: ${CRMApp.currentContact.name}] ${noteContent}`,
                    date: new Date().toISOString()
                };
                CRMApp.notes.push(accountNote);
            }
            
            // Add activity for both contact and account
            const newActivity = {
                id: Date.now() + 2,
                contactId: CRMApp.currentContact.id,
                accountId: CRMApp.currentContact.accountId,
                title: 'Note Added',
                content: `Added note: ${noteContent.substring(0, 50)}${noteContent.length > 50 ? '...' : ''}`,
                date: new Date().toISOString()
            };
            
            CRMApp.activities.push(newActivity);
            
            noteInput.value = '';
            renderContactNotes(CRMApp.currentContact.id);
            renderContactActivities(CRMApp.currentContact.id);
            showToast('Note added successfully!', 'success');
        }

        function openLinkedInProfile(type) {
            let linkedinUrl = '';
            
            if (type === 'contact' && CRMApp.currentContact && CRMApp.currentContact.linkedin) {
                linkedinUrl = CRMApp.currentContact.linkedin;
            } else if (type === 'account' && CRMApp.currentAccount && CRMApp.currentAccount.linkedin) {
                linkedinUrl = CRMApp.currentAccount.linkedin;
            }
            
            if (linkedinUrl) {
                // Ensure URL has proper protocol
                if (!linkedinUrl.startsWith('http://') && !linkedinUrl.startsWith('https://')) {
                    linkedinUrl = 'https://' + linkedinUrl;
                }
                window.open(linkedinUrl, '_blank');
            } else {
                showToast('No LinkedIn profile available.', 'warning');
            }
        }
        
        function showAccountDetail(accountId) {
            CRMApp.currentAccount = CRMApp.accounts.find(a => a.id === accountId);
            if (!CRMApp.currentAccount) {
                showToast('Account not found.', 'error');
                return;
            }
            showView('account-detail');
        }

        function renderAccountDetail() {
            if (!CRMApp.currentAccount) return;
            const account = CRMApp.currentAccount;
            gId('account-detail-title').textContent = account.name;
            renderAccountInfo(account);
            renderAccountContacts(account.id);
            renderAccountActivities(account.id);
        }

        function renderAccountInfo(account) {
            // Render Apollo-style company info
            const consolidatedDisplay = gId('account-info-consolidated');
            if (consolidatedDisplay) {
                // Generate company logo from name
                const logoText = account.name ? account.name.charAt(0).toUpperCase() : 'C';
                
                consolidatedDisplay.innerHTML = `
                    <div class="apollo-company-header">
                        <div class="company-logo">
                            ${logoText}
                        </div>
                        <div class="company-header-info">
                            <div class="company-name-row">
                                <h2 class="company-name">${account.name || 'Company Name'}</h2>
                                <div class="company-quick-actions">
                                    <button class="quick-action-btn call" onclick="openCallsHubWithData()" title="Call Account">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                        </svg>
                                        Call
                                    </button>
                                    ${account.apolloLink ? `
                                        <a href="${account.apolloLink}" target="_blank" class="quick-action-btn apollo" title="View on Apollo">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                                <polyline points="15,3 21,3 21,9"/>
                                                <line x1="10" y1="14" x2="21" y2="3"/>
                                            </svg>
                                            Apollo
                                        </a>
                                    ` : ''}
                                    ${account.linkedin ? `
                                        <a href="${account.linkedin}" target="_blank" class="quick-action-btn linkedin" title="View on LinkedIn">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                                                <rect x="2" y="9" width="4" height="12"/>
                                                <circle cx="4" cy="4" r="2"/>
                                            </svg>
                                            LinkedIn
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                            <div class="company-meta">
                                <span>${account.industry || 'Industry'}</span>
                                <span>•</span>
                                <span>${account.city || 'City'}, ${account.state || 'State'}</span>
                                ${account.employeeCount ? `<span>•</span><span>${account.employeeCount} employees</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="apollo-summary" onclick="toggleSummaryEditor()">
                        <div class="apollo-summary-header">
                            <h4 class="apollo-summary-title">Company Summary</h4>
                        </div>
                        <div class="apollo-summary-content" id="apollo-summary-display">
                            ${account.companySummary || ''}
                        </div>
                    </div>

                    <div class="apollo-fields-container">
                        <div class="apollo-field-group">
                            <div class="apollo-field" data-field="industry">
                                <div class="apollo-field-label">Industry</div>
                                <div class="apollo-field-value">${account.industry || ''}</div>
                                <input type="text" class="apollo-field-edit" value="${account.industry || ''}" />
                                <div class="apollo-field-actions">
                                    <button class="field-action-btn copy" onclick="copyFieldValue('industry')" title="Copy">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                    </button>
                                    <button class="field-action-btn edit" onclick="editField('industry')" title="Edit">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="edit-actions">
                                    <button class="edit-action-btn save" onclick="saveField('industry')">Save</button>
                                    <button class="edit-action-btn cancel" onclick="cancelEdit('industry')">Cancel</button>
                                </div>
                            </div>

                            <div class="apollo-field" data-field="employeeCount">
                                <div class="apollo-field-label">Employee Count</div>
                                <div class="apollo-field-value">${account.employeeCount || ''}</div>
                                <input type="text" class="apollo-field-edit" value="${account.employeeCount || ''}" />
                                <div class="apollo-field-actions">
                                    <button class="field-action-btn copy" onclick="copyFieldValue('employeeCount')" title="Copy">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                    </button>
                                    <button class="field-action-btn edit" onclick="editField('employeeCount')" title="Edit">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="edit-actions">
                                    <button class="edit-action-btn save" onclick="saveField('employeeCount')">Save</button>
                                    <button class="edit-action-btn cancel" onclick="cancelEdit('employeeCount')">Cancel</button>
                                </div>
                            </div>

                            <div class="apollo-field" data-field="city">
                                <div class="apollo-field-label">City</div>
                                <div class="apollo-field-value">${account.city || ''}</div>
                                <input type="text" class="apollo-field-edit" value="${account.city || ''}" />
                                <div class="apollo-field-actions">
                                    <button class="field-action-btn copy" onclick="copyFieldValue('city')" title="Copy">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                    </button>
                                    <button class="field-action-btn edit" onclick="editField('city')" title="Edit">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="edit-actions">
                                    <button class="edit-action-btn save" onclick="saveField('city')">Save</button>
                                    <button class="edit-action-btn cancel" onclick="cancelEdit('city')">Cancel</button>
                                </div>
                            </div>

                            <div class="apollo-field" data-field="revenue">
                                <div class="apollo-field-label">Annual Revenue</div>
                                <div class="apollo-field-value">${account.revenue || ''}</div>
                                <input type="text" class="apollo-field-edit" value="${account.revenue || ''}" />
                                <div class="apollo-field-actions">
                                    <button class="field-action-btn copy" onclick="copyFieldValue('revenue')" title="Copy">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                    </button>
                                    <button class="field-action-btn edit" onclick="editField('revenue')" title="Edit">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="edit-actions">
                                    <button class="edit-action-btn save" onclick="saveField('revenue')">Save</button>
                                    <button class="edit-action-btn cancel" onclick="cancelEdit('revenue')">Cancel</button>
                                </div>
                            </div>

                            <div class="apollo-field" data-field="state">
                                <div class="apollo-field-label">State</div>
                                <div class="apollo-field-value">${account.state || ''}</div>
                                <input type="text" class="apollo-field-edit" value="${account.state || ''}" />
                                <div class="apollo-field-actions">
                                    <button class="field-action-btn copy" onclick="copyFieldValue('state')" title="Copy">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                    </button>
                                    <button class="field-action-btn edit" onclick="editField('state')" title="Edit">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="edit-actions">
                                    <button class="edit-action-btn save" onclick="saveField('state')">Save</button>
                                    <button class="edit-action-btn cancel" onclick="cancelEdit('state')">Cancel</button>
                                </div>
                            </div>

                            <div class="apollo-field" data-field="apolloLink">
                                <div class="apollo-field-label">Apollo Link</div>
                                <div class="apollo-field-value">${account.apolloLink || ''}</div>
                                <input type="url" class="apollo-field-edit" value="${account.apolloLink || ''}" />
                                <div class="apollo-field-actions">
                                    <button class="field-action-btn copy" onclick="copyFieldValue('apolloLink')" title="Copy">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                    </button>
                                    <button class="field-action-btn edit" onclick="editField('apolloLink')" title="Edit">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="edit-actions">
                                    <button class="edit-action-btn save" onclick="saveField('apolloLink')">Save</button>
                                    <button class="edit-action-btn cancel" onclick="cancelEdit('apolloLink')">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="apollo-contact-row">
                        <div class="apollo-contact-item">
                            <div class="apollo-contact-label">Phone Number</div>
                            <div class="apollo-contact-value">${account.phone || ''}</div>
                        </div>
                        <div class="apollo-contact-item">
                            <div class="apollo-contact-label">Founded Year</div>
                            <div class="apollo-contact-value">${account.foundedYear || ''}</div>
                        </div>
                        <div class="apollo-contact-item">
                            <div class="apollo-contact-label">Website</div>
                            <div class="apollo-contact-value">
                                ${account.website ? `<a href="${account.website}" target="_blank" style="color: #60a5fa;">${account.website}</a>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            // Populate contract form with new fields
            const contractFields = [
                { id: 'contract-provider', key: 'contractProvider' },
                { id: 'contract-rate', key: 'contractrate' },
                { id: 'contract-expiration', key: 'contractExpiration' },
                { id: 'contract-type', key: 'contractType' },
                { id: 'annual-kwh', key: 'annualkWh' },
                { id: 'monthly-bill', key: 'monthlybill' },
                { id: 'sell-rate', key: 'sellrate' }
            ];
            
            contractFields.forEach(field => {
                const element = gId(field.id);
                if (element) {
                    element.value = account[field.key] || '';
                }
            });

            // Initialize energy calculator
            initializeEnergyCalculator(account);
        }

        function renderCompanySummary(account) {
            const summaryDisplay = gId('company-summary-display');
            const summaryInput = gId('company-summary-input');
            
            if (summaryDisplay && summaryInput) {
                if (account.companySummary) {
                    summaryDisplay.innerHTML = `<p>${account.companySummary}</p>`;
                    summaryInput.value = account.companySummary;
                } else {
                    summaryDisplay.innerHTML = '<p class="empty-state">No company summary available. Click "Edit" to add one.</p>';
                    summaryInput.value = '';
                }
            }
        }

        function initializeEnergyCalculator(account) {
            const calculatorContainer = gId('energy-calculator-container');
            if (!calculatorContainer) return;

            const hasData = account.contractrate && account.annualkWh && account.monthlybill && account.sellrate;
            
            calculatorContainer.innerHTML = `
                <div class="calculator-container">
                    <div class="calc-input-group">
                        <label class="calc-input-label">Monthly Bill ($)</label>
                        <input type="number" class="calc-form-input" id="calc-monthly-bill"
                               placeholder="e.g., 1,450" step="0.01"
                               value="${account.monthlybill || ''}"
                               oninput="updateCalculator()">
                    </div>
                    
                    <div class="calc-input-group">
                        <label class="calc-input-label">Current Rate ($/kWh)</label>
                        <input type="number" class="calc-form-input" id="calc-current-rate"
                               placeholder="e.g., 0.062" step="0.001"
                               value="${account.contractrate || ''}"
                               oninput="updateCalculator()">
                    </div>
                    
                    <div class="calc-input-group">
                        <label class="calc-input-label">Our Sell Rate ($/kWh)</label>
                        <input type="number" class="calc-form-input" id="calc-sell-rate"
                               placeholder="e.g., 0.07" step="0.001"
                               value="${account.sellrate || ''}"
                               oninput="updateCalculator()">
                    </div>
                    
                    <div class="calc-input-group">
                        <label class="calc-input-label">Annual kWh Usage</label>
                        <input type="number" class="calc-form-input" id="calc-annual-kwh"
                               placeholder="e.g., 150,000" step="1000"
                               value="${account.annualkWh || ''}"
                               oninput="updateCalculator()">
                    </div>
                    
                    <div class="calc-input-group">
                        <label class="calc-input-label">Contract Expiration Date</label>
                        <input type="date" class="calc-form-input" id="calc-contract-expiration"
                               value="${account.contractExpiration || ''}"
                               oninput="updateCalculator()">
                    </div>
                    
                    <button class="calculate-btn" id="calc-btn" onclick="performEnergyHealthCheck()"
                            style="background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);"
                            ${hasData ? '' : 'disabled'}>
                        ${hasData ? 'Run Health Check' : 'Enter Data Above'}
                    </button>
                    
                    <div class="health-check-cards" id="health-check-cards" style="display: none;">
                        <!-- Card-based results will appear here -->
                    </div>
                </div>
            `;

            // Auto-calculate if we have data
            if (hasData) {
                setTimeout(() => {
                    performEnergyHealthCheck();
                }, 1000);
            }
        }

        function updateCalculator() {
            const monthlyBill = parseFloat(gId('calc-monthly-bill').value) || 0;
            const currentRate = parseFloat(gId('calc-current-rate').value) || 0;
            const sellRate = parseFloat(gId('calc-sell-rate').value) || 0;
            const annualKwh = parseFloat(gId('calc-annual-kwh').value) || 0;
            const calcBtn = gId('calc-btn');
            
            let completedFields = 0;
            if (monthlyBill > 0) completedFields++;
            if (currentRate > 0) completedFields++;
            if (sellRate > 0) completedFields++;
            if (annualKwh > 0) completedFields++;
            
            if (completedFields === 4) {
                calcBtn.disabled = false;
                calcBtn.textContent = 'Run Health Check';
            } else {
                calcBtn.disabled = true;
                calcBtn.textContent = 'Enter Data Above';
            }
        }

        // Global variables for card navigation
        let currentCardIndex = 0;
        let healthCheckData = null;

        async function performEnergyHealthCheck() {
            const monthlyBill = parseFloat(gId('calc-monthly-bill').value);
            const currentRate = parseFloat(gId('calc-current-rate').value);
            const sellRate = parseFloat(gId('calc-sell-rate').value);
            const annualKwh = parseFloat(gId('calc-annual-kwh').value);
            const contractExpiration = gId('calc-contract-expiration').value;
            const cardsContainer = gId('health-check-cards');
            
            if (!monthlyBill || !currentRate || !sellRate || !annualKwh) return;

            // Auto-save calculator data to account
            if (CRMApp.currentAccount) {
                try {
                    await db.collection('accounts').doc(CRMApp.currentAccount.id).update({
                        contractrate: currentRate,
                        sellrate: sellRate,
                        annualkWh: annualKwh,
                        monthlybill: monthlyBill,
                        contractExpiration: contractExpiration,
                        updatedAt: serverTimestamp()
                    });
                    
                    // Update current account object
                    Object.assign(CRMApp.currentAccount, {
                        contractrate: currentRate,
                        sellrate: sellRate,
                        annualkWh: annualKwh,
                        monthlybill: monthlyBill,
                        contractExpiration: contractExpiration
                    });
                } catch (error) {
                    console.error('Error auto-saving calculator data:', error);
                }
            }

            // Calculate with proper delivery charges
            const DELIVERY_CHARGE = 0.05; // $0.05/kWh for delivery
            const currentAllInRate = currentRate + DELIVERY_CHARGE;
            const ourAllInRate = sellRate + DELIVERY_CHARGE;
            
            const annualCurrentCost = annualKwh * currentAllInRate;
            const annualProjectedCost = annualKwh * ourAllInRate;
            const annualSavings = annualCurrentCost - annualProjectedCost;
            const percentageChange = (annualSavings / annualCurrentCost) * 100;
            
            const monthlySavings = annualSavings / 12;
            const monthlyPercentageChange = percentageChange; // Same percentage

            // Calculate contract expiration urgency and health score
            let monthsUntilExpiration = 0;
            let healthScore = 50; // Base score
            let urgencyLevel = 'medium';
            let actionSteps = [];

            if (contractExpiration) {
                const expirationDate = new Date(contractExpiration);
                const today = new Date();
                const timeDiff = expirationDate.getTime() - today.getTime();
                monthsUntilExpiration = Math.ceil(timeDiff / (1000 * 3600 * 24 * 30));
            }

            // Determine health score and recommendations based on user's logic
            if (Math.abs(percentageChange) > 40) {
                // Over 40% savings potential - immediate action needed
                if (percentageChange > 40) {
                    healthScore = 15; // Terrible situation - missing huge savings
                    urgencyLevel = 'critical';
                    actionSteps = [
                        'IMMEDIATE ACTION REQUIRED: Customer is missing significant savings',
                        'Schedule contract review meeting within 48 hours',
                        'Consider early termination if penalties are less than potential savings',
                        'Prepare detailed cost-benefit analysis for decision makers'
                    ];
                } else {
                    healthScore = 25; // Bad situation - would increase costs significantly
                    urgencyLevel = 'high';
                    actionSteps = [
                        'Current rate is significantly better than our offering',
                        'Focus on service quality and additional value propositions',
                        'Monitor market conditions for future opportunities',
                        'Maintain relationship for contract renewal timing'
                    ];
                }
            } else if (monthsUntilExpiration <= 6 && Math.abs(percentageChange) > 15) {
                // Contract expires within 6 months and rate increase over 15%
                healthScore = 20;
                urgencyLevel = 'critical';
                actionSteps = [
                    'CONTRACT EXPIRES SOON: Customer needs to renew now',
                    'Rate increase of ' + Math.abs(percentageChange).toFixed(1) + '% is significant',
                    'Schedule immediate renewal meeting',
                    'Prepare competitive rate proposal'
                ];
            } else if (monthsUntilExpiration > 6 && monthsUntilExpiration <= 12 && Math.abs(percentageChange) > 30) {
                // Contract expires in 6-12 months with 30%+ impact
                healthScore = 35;
                urgencyLevel = 'high';
                actionSteps = [
                    'Customer should seriously consider early renewal',
                    'Projected cost impact of ' + Math.abs(percentageChange).toFixed(1) + '% is substantial',
                    'Present early renewal options with locked-in rates',
                    'Schedule strategy meeting within 2 weeks'
                ];
            } else if (monthsUntilExpiration > 12 && monthsUntilExpiration <= 24) {
                // 1-2 years until expiration - optimal planning time
                healthScore = 75;
                urgencyLevel = 'low';
                actionSteps = [
                    'OPTIMAL TIMING: Customer has time for strategic planning',
                    'Begin market monitoring and rate trend analysis',
                    'Schedule quarterly check-ins to track market conditions',
                    'Prepare long-term energy budget projections'
                ];
            } else if (monthsUntilExpiration > 24) {
                // More than 2 years - too early to act
                healthScore = 90;
                urgencyLevel = 'none';
                actionSteps = [
                    'Contract expires in over 2 years - no immediate action needed',
                    'Focus on relationship building and market intelligence',
                    'Schedule annual review meetings',
                    'Monitor for any major business changes that might affect energy needs'
                ];
            } else {
                // Default case based on savings potential
                if (Math.abs(percentageChange) < 5) {
                    healthScore = 80; // Good position
                    actionSteps = [
                        'Customer is in a competitive rate position',
                        'Focus on service quality and relationship maintenance',
                        'Monitor market for future opportunities'
                    ];
                } else if (Math.abs(percentageChange) < 15) {
                    healthScore = 60; // Moderate opportunity
                    actionSteps = [
                        'Moderate savings opportunity available',
                        'Present value proposition beyond just rate savings',
                        'Schedule consultation to discuss options'
                    ];
                } else {
                    healthScore = 40; // Significant opportunity
                    actionSteps = [
                        'Significant opportunity for improvement',
                        'Schedule detailed energy analysis meeting',
                        'Prepare comprehensive proposal'
                    ];
                }
            }

            // Store data for card navigation
            healthCheckData = {
                annualSavings,
                monthlySavings,
                percentageChange,
                monthlyPercentageChange,
                healthScore,
                urgencyLevel,
                actionSteps,
                currentAllInRate,
                ourAllInRate,
                annualKwh,
                monthsUntilExpiration
            };

            // Show cards container and render first card
            cardsContainer.style.display = 'block';
            currentCardIndex = 0;
            renderHealthCheckCard();
        }

        function renderHealthCheckCard() {
            const cardsContainer = gId('health-check-cards');
            if (!cardsContainer || !healthCheckData) return;

            const { annualSavings, monthlySavings, percentageChange, monthlyPercentageChange,
                    healthScore, urgencyLevel, actionSteps, currentAllInRate, ourAllInRate,
                    annualKwh, monthsUntilExpiration } = healthCheckData;

            let cardContent = '';

            if (currentCardIndex === 0) {
                // Card 1: Annual Savings/Increases
                const isPositive = annualSavings > 0;
                const amountClass = isPositive ? 'positive' : (annualSavings < 0 ? 'negative' : 'neutral');
                const actionText = isPositive ? 'save' : 'increase costs by';
                
                cardContent = `
                    <div class="health-card active">
                        <div class="health-card-header">
                            <div class="health-card-title">Annual Impact Analysis</div>
                            <div class="health-card-subtitle">Based on ${annualKwh.toLocaleString()} kWh annual usage</div>
                        </div>
                        <div class="savings-amount">
                            <div class="savings-number ${amountClass}">
                                $${Math.abs(annualSavings).toLocaleString()}
                            </div>
                            <div class="savings-label">
                                ${isPositive ? 'Annual Savings Potential' : 'Annual Cost Increase'}
                            </div>
                            <div class="savings-description">
                                Customer can ${actionText} ${Math.abs(percentageChange).toFixed(1)}% annually with our rates
                            </div>
                        </div>
                        <div style="font-size: 0.8rem; color: #9ca3af; text-align: center; margin-top: 16px;">
                            Current all-in rate: $${currentAllInRate.toFixed(3)}/kWh<br>
                            Our all-in rate: $${ourAllInRate.toFixed(3)}/kWh<br>
                            (Includes $0.05/kWh delivery charges)
                        </div>
                        <div class="card-navigation">
                            <button class="nav-arrow" disabled>‹</button>
                            <div class="card-indicator">
                                <div class="indicator-dot active"></div>
                                <div class="indicator-dot"></div>
                                <div class="indicator-dot"></div>
                            </div>
                            <button class="nav-arrow" onclick="nextHealthCard()">›</button>
                        </div>
                    </div>
                `;
            } else if (currentCardIndex === 1) {
                // Card 2: Monthly Savings/Increases
                const isPositive = monthlySavings > 0;
                const amountClass = isPositive ? 'positive' : (monthlySavings < 0 ? 'negative' : 'neutral');
                const actionText = isPositive ? 'save' : 'increase costs by';
                
                cardContent = `
                    <div class="health-card active">
                        <div class="health-card-header">
                            <div class="health-card-title">Monthly Impact Analysis</div>
                            <div class="health-card-subtitle">Monthly budget impact breakdown</div>
                        </div>
                        <div class="savings-amount">
                            <div class="savings-number ${amountClass}">
                                $${Math.abs(monthlySavings).toLocaleString()}
                            </div>
                            <div class="savings-label">
                                ${isPositive ? 'Monthly Savings Potential' : 'Monthly Cost Increase'}
                            </div>
                            <div class="savings-description">
                                Customer can ${actionText} ${Math.abs(monthlyPercentageChange).toFixed(1)}% on monthly energy costs
                            </div>
                        </div>
                        <div style="font-size: 0.8rem; color: #9ca3af; text-align: center; margin-top: 16px;">
                            Based on average monthly usage of ${(annualKwh/12).toLocaleString()} kWh<br>
                            ${isPositive ? 'Savings' : 'Additional cost'} of $${Math.abs(monthlySavings).toFixed(2)} per month
                        </div>
                        <div class="card-navigation">
                            <button class="nav-arrow" onclick="prevHealthCard()">‹</button>
                            <div class="card-indicator">
                                <div class="indicator-dot"></div>
                                <div class="indicator-dot active"></div>
                                <div class="indicator-dot"></div>
                            </div>
                            <button class="nav-arrow" onclick="nextHealthCard()">›</button>
                        </div>
                    </div>
                `;
            } else if (currentCardIndex === 2) {
                // Card 3: Health Score and Actionable Steps
                let scoreClass = 'health-score-51-75';
                let scoreDescription = 'Moderate Energy Health';
                
                if (healthScore <= 25) {
                    scoreClass = 'health-score-0-25';
                    scoreDescription = 'Critical - Immediate Action Required';
                } else if (healthScore <= 50) {
                    scoreClass = 'health-score-26-50';
                    scoreDescription = 'Poor - Action Recommended';
                } else if (healthScore <= 75) {
                    scoreClass = 'health-score-51-75';
                    scoreDescription = 'Good - Monitor Regularly';
                } else {
                    scoreClass = 'health-score-76-100';
                    scoreDescription = 'Excellent - Optimal Position';
                }

                cardContent = `
                    <div class="health-card active">
                        <div class="health-card-header">
                            <div class="health-card-title">Energy Health Score</div>
                            <div class="health-card-subtitle">Overall assessment and recommendations</div>
                        </div>
                        <div class="health-score-display">
                            <div class="health-score-number ${scoreClass}">
                                ${healthScore}%
                            </div>
                            <div class="health-score-label">${scoreDescription}</div>
                            <div class="health-score-description">
                                ${monthsUntilExpiration > 0 ? `Contract expires in ${monthsUntilExpiration} months` : 'Contract expiration date not specified'}
                            </div>
                        </div>
                        <div class="actionable-steps">
                            <h4>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 11l3 3L22 4"/>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                                Recommended Actions
                            </h4>
                            <ul>
                                ${actionSteps.map(step => `<li>${step}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="card-navigation">
                            <button class="nav-arrow" onclick="prevHealthCard()">‹</button>
                            <div class="card-indicator">
                                <div class="indicator-dot"></div>
                                <div class="indicator-dot"></div>
                                <div class="indicator-dot active"></div>
                            </div>
                            <button class="nav-arrow" disabled>›</button>
                        </div>
                    </div>
                `;
            }

            cardsContainer.innerHTML = cardContent;
        }

        function nextHealthCard() {
            if (currentCardIndex < 2) {
                currentCardIndex++;
                renderHealthCheckCard();
            }
        }

        function prevHealthCard() {
            if (currentCardIndex > 0) {
                currentCardIndex--;
                renderHealthCheckCard();
            }
        }

        function renderAccountContacts(accountId) {
            const list = gId('account-contacts-list');
            if (!list) return;
            const accountContacts = CRMApp.contacts.filter(c => c.accountId === accountId);
            
            if (accountContacts.length === 0) {
                list.innerHTML = '<p class="empty-state">No contacts for this account</p>';
                return;
            }
            
            list.innerHTML = accountContacts.map(contact => `
                <div class="contact-list-item">
                    <div class="contact-info">
                        <div class="contact-name">${contact.firstName} ${contact.lastName}</div>
                        <div class="contact-title">${contact.title || 'No Title'}</div>
                        ${contact.email ? `<div class="contact-email clickable-email" onclick="openEmailCompose('${contact.email}', '${contact.firstName} ${contact.lastName}')">${contact.email}</div>` : ''}
                    </div>
                    <div class="card-actions">
                        ${contact.email ? `<button class="email-action-btn" onclick="openEmailCompose('${contact.email}', '${contact.firstName} ${contact.lastName}')" title="Send Email">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                            </svg>
                        </button>` : ''}
                        <button class="icon-btn call-prospect" onclick="openCallsHubWithData('${contact.id}')" title="Call Prospect">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                        </button>
                        <button class="icon-btn edit-contact" onclick="openContactModal(CRMApp.contacts.find(c => c.id === '${contact.id}'))" title="Edit Contact">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                <path d="m15 5 4 4"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');
        }
        
        function renderAccountActivities(accountId) {
            const list = gId('account-activities-list');
            if (!list) return;
            const accountActivities = CRMApp.activities.filter(a => a.accountId === accountId);
            
            if (accountActivities.length === 0) {
                list.innerHTML = '<p class="empty-state">No recent activities</p>';
                return;
            }
            
            list.innerHTML = accountActivities.map(activity => `
                <div class="activity-item">
                    <div class="activity-title">${activity.description}</div>
                    <div class="activity-content">${activity.noteContent || ''}</div>
                    <div class="activity-date">Time: ${formatDate(activity.createdAt)}</div>
                </div>
            `).join('');
        }

        // Modal Functions
        function setupModals() {
            const modalElements = [
                { modal: 'account-modal', openBtns: ['new-account-btn', 'add-account-btn', 'edit-account-btn'], closeBtns: ['close-account-modal', 'cancel-account'], openFn: 'openAccountModal', closeFn: 'closeAccountModal' },
                { modal: 'contact-modal', openBtns: ['new-contact-btn', 'add-contact-btn', 'quick-add-contact'], closeBtns: ['close-contact-modal', 'cancel-contact'], openFn: 'openContactModal', closeFn: 'closeContactModal' }
            ];

            modalElements.forEach(({ modal, openBtns, closeBtns, openFn, closeFn }) => {
                const modalEl = gId(modal);
                
                openBtns.forEach(btnId => {
                    const btn = gId(btnId);
                    if (btn) {
                        btn.addEventListener('click', () => {
                            if (btnId.includes('edit')) {
                                window[openFn](CRMApp.currentAccount || CRMApp.currentContact);
                            } else {
                                window[openFn]();
                            }
                        });
                    }
                });
                
                closeBtns.forEach(btnId => {
                    const btn = gId(btnId);
                    if (btn) {
                        btn.addEventListener('click', () => window[closeFn]());
                    }
                });
                
                if (modalEl) {
                    modalEl.addEventListener('click', (e) => {
                        if (e.target.id === modal) window[closeFn]();
                    });
                }
            });
        }
        
        function openAccountModal(account = null) {
            const modal = gId('account-modal');
            const form = gId('account-form');
            form.reset();
            
            if (account) {
                gId('account-modal-title').textContent = 'Edit Account';
                const fields = [
                    'name', 'industry', 'phone', 'website', 'city', 'state',
                    'employee-count', 'revenue', 'founded-year', 'apollo-link',
                    'address', 'pain-points', 'benefits'
                ];
                fields.forEach(field => {
                    const element = gId(`account-${field}`);
                    if (element) {
                        let key = field;
                        if (field === 'pain-points') key = 'painPoints';
                        else if (field === 'benefits') key = 'benefits';
                        else if (field === 'employee-count') key = 'employeeCount';
                        else if (field === 'founded-year') key = 'foundedYear';
                        else if (field === 'apollo-link') key = 'apolloLink';
                        
                        element.value = account[key] || '';
                    }
                });
                CRMApp.currentAccount = account;
            } else {
                gId('account-modal-title').textContent = 'Add New Account';
                CRMApp.currentAccount = null;
            }
            modal.classList.add('active');
        }
        
        function closeAccountModal() {
            gId('account-modal').classList.remove('active');
        }
        
        function openContactModal(contact = null) {
            const modal = gId('contact-modal');
            const form = gId('contact-form');
            form.reset();
            updateContactAccountDropdown();
            
            if (contact) {
                gId('contact-modal-title').textContent = 'Edit Contact';
                const fields = [
                    { id: 'contact-first-name', key: 'firstName' },
                    { id: 'contact-last-name', key: 'lastName' },
                    { id: 'contact-title', key: 'title' },
                    { id: 'contact-email', key: 'email' },
                    { id: 'contact-phone', key: 'phone' },
                    { id: 'contact-notes', key: 'notes' },
                    { id: 'contact-account', key: 'accountId' }
                ];
                fields.forEach(field => {
                    const element = gId(field.id);
                    if (element) {
                        element.value = contact[field.key] || '';
                    }
                });
                CRMApp.currentContact = contact;
            } else {
                gId('contact-modal-title').textContent = 'Add New Contact';
                CRMApp.currentContact = null;
            }
            modal.classList.add('active');
        }
        
        function closeContactModal() {
            gId('contact-modal').classList.remove('active');
        }
        
        function updateContactAccountDropdown() {
            const select = gId('contact-account');
            if (!select) return;
            select.innerHTML = '<option value="">Select an account...</option>';
            CRMApp.accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.name;
                select.appendChild(option);
            });
        }

        // Event Handlers
        function setupEventListeners() {
            const handlers = [
                { id: 'account-form', event: 'submit', handler: handleAccountSubmit },
                { id: 'contact-form', event: 'submit', handler: handleContactSubmit },
                { id: 'back-to-accounts', event: 'click', handler: () => showView('accounts') },
                { id: 'energy-contract-form', event: 'submit', handler: handleEnergyContractSubmit },
                { id: 'save-account-note', event: 'click', handler: handleSaveAccountNote },
                { id: 'bulk-import-btn', event: 'click', handler: handleBulkImport },
                { id: 'edit-summary-btn', event: 'click', handler: toggleSummaryEditor },
                { id: 'save-summary-btn', event: 'click', handler: saveSummary },
                { id: 'cancel-summary-btn', event: 'click', handler: cancelSummaryEdit }
            ];

            handlers.forEach(({ id, event, handler }) => {
                const element = gId(id);
                if (element) {
                    element.addEventListener(event, handler);
                }
            });
        }

        async function handleAccountSubmit(e) {
            e.preventDefault();
            showLoading(true);
            const accountId = CRMApp.currentAccount ? CRMApp.currentAccount.id : null;
            const accountData = {
                name: gId('account-name').value,
                industry: gId('account-industry').value,
                phone: gId('account-phone').value,
                linkedin: gId('account-linkedin').value,
                website: gId('account-website').value,
                city: gId('account-city').value,
                state: gId('account-state').value,
                employeeCount: gId('account-employee-count').value,
                revenue: gId('account-revenue').value,
                foundedYear: gId('account-founded-year').value,
                apolloLink: gId('account-apollo-link').value,
                address: gId('account-address').value,
                painPoints: gId('account-pain-points').value,
                benefits: gId('account-benefits').value,
                updatedAt: serverTimestamp()
            };
            
            try {
                if (accountId) {
                    await db.collection('accounts').doc(accountId).update(accountData);
                    showToast('Account updated successfully!');
                    await logActivity({
                        type: 'account_updated',
                        description: `Updated account: ${accountData.name}`,
                        accountId: accountId,
                        accountName: accountData.name
                    });
                } else {
                    const newDoc = await db.collection('accounts').add({
                        ...accountData,
                        createdAt: serverTimestamp()
                    });
                    showToast('Account created successfully!');
                    await logActivity({
                        type: 'account_created',
                        description: `Created new account: ${accountData.name}`,
                        accountId: newDoc.id,
                        accountName: accountData.name
                    });
                }
                await loadInitialData();
            } catch (error) {
                console.error('Error saving account:', error);
                showToast('Error saving account.', 'error');
            } finally {
                closeAccountModal();
                showLoading(false);
            }
        }

        async function handleContactSubmit(e) {
            e.preventDefault();
            showLoading(true);
            const contactId = CRMApp.currentContact ? CRMApp.currentContact.id : null;
            const accountId = gId('contact-account').value;
            const accountName = accountId ? CRMApp.accounts.find(a => a.id === accountId)?.name : 'Unassigned';
            
            const contactData = {
                firstName: gId('contact-first-name').value,
                lastName: gId('contact-last-name').value,
                title: gId('contact-title').value,
                accountId: accountId,
                accountName: accountName,
                email: gId('contact-email').value,
                phone: gId('contact-phone').value,
                linkedin: gId('contact-linkedin').value,
                notes: gId('contact-notes').value,
                updatedAt: serverTimestamp()
            };
            
            try {
                if (contactId) {
                    await db.collection('contacts').doc(contactId).update(contactData);
                    showToast('Contact updated successfully!');
                    await logActivity({
                        type: 'contact_updated',
                        description: `Updated contact: ${contactData.firstName} ${contactData.lastName}`,
                        contactId: contactId,
                        contactName: `${contactData.firstName} ${contactData.lastName}`,
                        accountId: accountId,
                        accountName: accountName
                    });
                } else {
                    const newDoc = await db.collection('contacts').add({
                        ...contactData,
                        createdAt: serverTimestamp()
                    });
                    showToast('Contact created successfully!');
                    await logActivity({
                        type: 'contact_created',
                        description: `Created new contact: ${contactData.firstName} ${contactData.lastName}`,
                        contactId: newDoc.id,
                        contactName: `${contactData.firstName} ${contactData.lastName}`,
                        accountId: accountId,
                        accountName: accountName
                    });
                }
                await loadInitialData();
            } catch (error) {
                console.error('Error saving contact:', error);
                showToast('Error saving contact.', 'error');
            } finally {
                closeContactModal();
                showLoading(false);
            }
        }

        async function handleEnergyContractSubmit(e) {
            e.preventDefault();
            if (!CRMApp.currentAccount) return;
            
            showLoading(true);
            const contractData = {
                contractProvider: gId('contract-provider').value,
                contractrate: gId('contract-rate').value,
                contractExpiration: gId('contract-expiration').value,
                contractType: gId('contract-type').value,
                annualkWh: gId('annual-kwh').value,
                monthlybill: gId('monthly-bill').value,
                sellrate: gId('sell-rate').value,
                updatedAt: serverTimestamp()
            };
            
            try {
                await db.collection('accounts').doc(CRMApp.currentAccount.id).update(contractData);
                
                // Update current account object
                Object.assign(CRMApp.currentAccount, contractData);
                
                // Re-initialize calculator with new data
                initializeEnergyCalculator(CRMApp.currentAccount);
                
                showToast('Energy contract updated successfully!');
                await logActivity({
                    type: 'contract_updated',
                    description: `Updated contract for: ${CRMApp.currentAccount.name}`,
                    accountId: CRMApp.currentAccount.id,
                    accountName: CRMApp.currentAccount.name
                });
            } catch (error) {
                console.error('Error saving contract info:', error);
                showToast('Error saving contract info.', 'error');
            } finally {
                showLoading(false);
            }
        }
        
        async function handleSaveAccountNote() {
            if (!CRMApp.currentAccount) return;
            
            const noteContent = gId('account-note-input').value;
            if (!noteContent.trim()) {
                showToast('Note cannot be empty.', 'warning');
                return;
            }
            
            showLoading(true);
            try {
                await logActivity({
                    type: 'account_note',
                    description: `Added a note to ${CRMApp.currentAccount.name}`,
                    noteContent: noteContent,
                    accountId: CRMApp.currentAccount.id,
                    accountName: CRMApp.currentAccount.name
                });
                
                showToast('Note saved successfully!');
                gId('account-note-input').value = '';
                await loadInitialData();
            } catch (error) {
                console.error('Error saving note:', error);
                showToast('Error saving note.', 'error');
            } finally {
                showLoading(false);
            }
        }

        function handleBulkImport() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.xlsx,.xls';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                showToast('Bulk import functionality would be implemented here. File selected: ' + file.name, 'info');
            };
            input.click();
        }

        async function deleteContact(contactId) {
            if (!confirm('Are you sure you want to delete this contact?')) return;
            
            showLoading(true);
            try {
                const contact = CRMApp.contacts.find(c => c.id === contactId);
                await db.collection('contacts').doc(contactId).delete();
                
                await logActivity({
                    type: 'contact_deleted',
                    description: `Deleted contact: ${contact.firstName} ${contact.lastName}`,
                    contactId: contactId,
                    contactName: `${contact.firstName} ${contact.lastName}`
                });
                
                showToast('Contact deleted successfully!');
                await loadInitialData();
            } catch (error) {
                console.error('Error deleting contact:', error);
                showToast('Error deleting contact.', 'error');
            } finally {
                showLoading(false);
            }
        }

        async function deleteAccount(accountId) {
            if (!confirm('Are you sure you want to delete this account? This will also delete all associated contacts.')) return;
            
            showLoading(true);
            try {
                const account = CRMApp.accounts.find(a => a.id === accountId);
                const associatedContacts = CRMApp.contacts.filter(c => c.accountId === accountId);
                
                for (const contact of associatedContacts) {
                    await db.collection('contacts').doc(contact.id).delete();
                }
                
                await db.collection('accounts').doc(accountId).delete();
                
                await logActivity({
                    type: 'account_deleted',
                    description: `Deleted account: ${account.name} and ${associatedContacts.length} associated contacts`,
                    accountId: accountId,
                    accountName: account.name
                });
                
                showToast('Account and associated contacts deleted successfully!');
                await loadInitialData();
            } catch (error) {
                console.error('Error deleting account:', error);
                showToast('Error deleting account.', 'error');
            } finally {
                showLoading(false);
            }
        }

        async function openCallsHubWithData(contactId = null) {
            showLoading(true);
            currentProspect = {};
            currentStep = 'start';
            history = [];

            if (contactId) {
                try {
                    const contactDoc = await db.collection('contacts').doc(contactId).get();
                    if (contactDoc.exists) {
                        const contact = contactDoc.data();
                        currentProspect.contactId = contactId;
                        currentProspect.name = `${contact.firstName} ${contact.lastName}`;
                        currentProspect.title = contact.title;
                        currentProspect.phone = contact.phone;
                        currentProspect.email = contact.email;
                        currentProspect.accountId = contact.accountId;
                        
                        if (contact.accountId) {
                            const accountDoc = await db.collection('accounts').doc(contact.accountId).get();
                            if (accountDoc.exists) {
                                const account = accountDoc.data();
                                currentProspect.company = account.name;
                                currentProspect.industry = account.industry;
                                currentProspect.painPoints = account.painPoints;
                                currentProspect.benefits = account.benefits;
                            }
                        }
                        
                        gId('call-notes').value = contact.notes || '';
                    } else {
                        showToast('Contact not found.', 'error');
                    }
                } catch (error) {
                    console.error('Error fetching data for calls hub:', error);
                    showToast('Error fetching contact data.', 'error');
                }
            } else {
                gId('call-notes').value = '';
            }

            showLoading(false);
            showView('calls-hub');
            displayCurrentStep();
        }

        // Company Summary Functions
        function toggleSummaryEditor() {
            const summaryDisplay = gId('company-summary-display');
            const summaryEditor = gId('company-summary-editor');
            
            if (summaryDisplay && summaryEditor) {
                if (summaryEditor.style.display === 'none' || !summaryEditor.style.display) {
                    summaryDisplay.style.display = 'none';
                    summaryEditor.style.display = 'block';
                    const textarea = gId('company-summary-input');
                    if (textarea) textarea.focus();
                } else {
                    summaryDisplay.style.display = 'block';
                    summaryEditor.style.display = 'none';
                }
            }
        }

        async function saveSummary() {
            if (!CRMApp.currentAccount) return;
            
            const summaryInput = gId('company-summary-input');
            if (!summaryInput) return;
            
            const summaryText = summaryInput.value.trim();
            
            showLoading(true);
            try {
                await db.collection('accounts').doc(CRMApp.currentAccount.id).update({
                    companySummary: summaryText,
                    updatedAt: serverTimestamp()
                });
                
                // Update current account object
                CRMApp.currentAccount.companySummary = summaryText;
                
                // Update display
                renderCompanySummary(CRMApp.currentAccount);
                
                // Hide editor, show display
                const summaryDisplay = gId('company-summary-display');
                const summaryEditor = gId('company-summary-editor');
                if (summaryDisplay && summaryEditor) {
                    summaryDisplay.style.display = 'block';
                    summaryEditor.style.display = 'none';
                }
                
                showToast('Company summary saved successfully!');
                
                await logActivity({
                    type: 'summary_updated',
                    description: `Updated company summary for: ${CRMApp.currentAccount.name}`,
                    accountId: CRMApp.currentAccount.id,
                    accountName: CRMApp.currentAccount.name
                });
                
            } catch (error) {
                console.error('Error saving company summary:', error);
                showToast('Error saving company summary.', 'error');
            } finally {
                showLoading(false);
            }
        }

        function cancelSummaryEdit() {
            const summaryDisplay = gId('company-summary-display');
            const summaryEditor = gId('company-summary-editor');
            const summaryInput = gId('company-summary-input');
            
            if (summaryDisplay && summaryEditor && summaryInput) {
                // Reset textarea to original value
                if (CRMApp.currentAccount && CRMApp.currentAccount.companySummary) {
                    summaryInput.value = CRMApp.currentAccount.companySummary;
                } else {
                    summaryInput.value = '';
                }
                
                // Show display, hide editor
                summaryDisplay.style.display = 'block';
                summaryEditor.style.display = 'none';
            }
        }

        function importSummaryFromCSV() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                showLoading(true);
                try {
                    const text = await file.text();
                    const lines = text.split('\n');
                    
                    // Simple CSV parsing - assumes first column is company name, second is summary
                    let foundSummary = '';
                    const currentAccountName = CRMApp.currentAccount?.name?.toLowerCase();
                    
                    for (let i = 1; i < lines.length; i++) { // Skip header row
                        const columns = lines[i].split(',');
                        if (columns.length >= 2) {
                            const companyName = columns[0].trim().toLowerCase().replace(/"/g, '');
                            const summary = columns[1].trim().replace(/"/g, '');
                            
                            if (companyName === currentAccountName) {
                                foundSummary = summary;
                                break;
                            }
                        }
                    }
                    
                    if (foundSummary) {
                        const summaryInput = gId('company-summary-input');
                        if (summaryInput) {
                            summaryInput.value = foundSummary;
                            toggleSummaryEditor(); // Show editor with imported text
                            showToast('Company summary imported from CSV!', 'success');
                        }
                    } else {
                        showToast('No matching company summary found in CSV file.', 'warning');
                    }
                    
                } catch (error) {
                    console.error('Error importing CSV:', error);
                    showToast('Error importing CSV file.', 'error');
                } finally {
                    showLoading(false);
                }
            };
            input.click();
        }

        // Application Initialization
        function initializeApp() {
            setupNavigation();
            setupModals();
            setupEventListeners();
            setupSearchFunctionality();
            loadInitialData();
            showView('dashboard');
        }

        // Make global functions available
        window.performSearch = performSearch;
        window.closeSearch = closeSearch;
        window.goBack = goBack;
        window.restart = restart;
        window.handleDialClick = handleDialClick;
        window.updateScript = updateScript;
        window.handleEditableFocus = handleEditableFocus;
        window.saveProspectAndNotes = saveProspectAndNotes;
        window.clearNotes = clearNotes;
        window.showView = showView;
        window.showAccountDetail = showAccountDetail;
        window.handleContactClick = handleContactClick;
        window.openAccountModal = openAccountModal;
        window.openContactModal = openContactModal;
        window.closeAccountModal = closeAccountModal;
        window.closeContactModal = closeContactModal;
        window.deleteContact = deleteContact;
        window.deleteAccount = deleteAccount;
        window.handleSearchResultClick = handleSearchResultClick;
        window.handleViewAll = handleViewAll;
        window.openCallsHubWithData = openCallsHubWithData;
        window.updateCalculator = updateCalculator;
        window.performEnergyHealthCheck = performEnergyHealthCheck;
        window.nextHealthCard = nextHealthCard;
        window.prevHealthCard = prevHealthCard;
        window.renderHealthCheckCard = renderHealthCheckCard;
        window.toggleSummaryEditor = toggleSummaryEditor;
        window.saveSummary = saveSummary;
        window.cancelSummaryEdit = cancelSummaryEdit;
        window.importSummaryFromCSV = importSummaryFromCSV;
        window.copyFieldValue = copyFieldValue;
        window.editField = editField;
        window.saveField = saveField;
        window.cancelEdit = cancelEdit;

        // Apollo-style field editing functions
        function copyFieldValue(fieldName) {
            const field = document.querySelector(`[data-field="${fieldName}"] .apollo-field-value`);
            if (field && field.textContent.trim()) {
                navigator.clipboard.writeText(field.textContent.trim()).then(() => {
                    showToast('Field value copied to clipboard', 'success');
                }).catch(() => {
                    showToast('Failed to copy to clipboard', 'error');
                });
            } else {
                showToast('No value to copy', 'warning');
            }
        }

        function editField(fieldName) {
            const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
            if (fieldElement) {
                fieldElement.classList.add('editing');
                const input = fieldElement.querySelector('.apollo-field-edit');
                if (input) {
                    input.focus();
                    input.select();
                }
            }
        }

        async function saveField(fieldName) {
            if (!CRMApp.currentAccount) return;
            
            const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
            const input = fieldElement?.querySelector('.apollo-field-edit');
            const valueDisplay = fieldElement?.querySelector('.apollo-field-value');
            
            if (!input || !valueDisplay) return;
            
            const newValue = input.value.trim();
            
            showLoading(true);
            try {
                // Update the database
                const updateData = {
                    [fieldName]: newValue,
                    updatedAt: serverTimestamp()
                };
                
                await db.collection('accounts').doc(CRMApp.currentAccount.id).update(updateData);
                
                // Update current account object
                CRMApp.currentAccount[fieldName] = newValue;
                
                // Update the display
                valueDisplay.textContent = newValue;
                
                // Exit edit mode
                fieldElement.classList.remove('editing');
                
                showToast(`${fieldName} updated successfully!`, 'success');
                
                await logActivity({
                    type: 'field_updated',
                    description: `Updated ${fieldName} for: ${CRMApp.currentAccount.name}`,
                    accountId: CRMApp.currentAccount.id,
                    accountName: CRMApp.currentAccount.name
                });
                
            } catch (error) {
                console.error(`Error saving ${fieldName}:`, error);
                showToast(`Error saving ${fieldName}.`, 'error');
            } finally {
                showLoading(false);
            }
        }

        function cancelEdit(fieldName) {
            const fieldElement = document.querySelector(`[data-field="${fieldName}"]`);
            const input = fieldElement?.querySelector('.apollo-field-edit');
            const valueDisplay = fieldElement?.querySelector('.apollo-field-value');
            
            if (fieldElement && input && valueDisplay) {
                // Reset input to original value
                input.value = valueDisplay.textContent.trim();
                
                // Exit edit mode
                fieldElement.classList.remove('editing');
            }
        }

        // Gmail Functionality
        let gmailEmails = [
            {
                id: 1,
                sender: 'John Smith',
                senderEmail: 'john.smith@example.com',
                subject: 'Q1 Energy Contract Review',
                body: 'Hi there,\n\nI wanted to follow up on our energy contract discussion. Our current agreement expires in March, and I\'d like to explore renewal options.\n\nCould we schedule a call this week to discuss rates and terms?\n\nBest regards,\nJohn Smith\nFacilities Manager\nABC Manufacturing',
                date: '2 hours ago',
                unread: true,
                starred: false
            },
            {
                id: 2,
                sender: 'Sarah Johnson',
                senderEmail: 'sarah.johnson@techcorp.com',
                subject: 'Energy Procurement Strategy Meeting',
                body: 'Hello,\n\nThank you for the comprehensive energy analysis you provided last week. The board was impressed with the potential savings.\n\nWe\'d like to move forward with the next steps. Are you available for a strategy meeting next Tuesday at 2 PM?\n\nPlease let me know your availability.\n\nBest,\nSarah Johnson\nCFO, TechCorp Solutions',
                date: '1 day ago',
                unread: true,
                starred: true
            },
            {
                id: 3,
                sender: 'Mike Davis',
                senderEmail: 'mike.davis@retailplus.com',
                subject: 'Re: Multi-site Energy Management',
                body: 'Hi,\n\nFollowing up on our conversation about managing energy costs across our 15 retail locations.\n\nI\'ve attached our current usage data for review. Looking forward to your recommendations on consolidating our energy procurement.\n\nThanks,\nMike Davis\nOperations Director\nRetail Plus',
                date: '3 days ago',
                unread: false,
                starred: false
            }
        ];

        let currentGmailEmail = null;
        let currentGmailFolder = 'inbox';

        function initializeGmail() {
            renderGmailEmails();
            setupGmailFolderNavigation();
        }

        function setupGmailFolderNavigation() {
            const navItems = document.querySelectorAll('.gmail-nav-item');
            navItems.forEach(item => {
                item.addEventListener('click', () => {
                    navItems.forEach(nav => nav.classList.remove('active'));
                    item.classList.add('active');
                    currentGmailFolder = item.getAttribute('data-folder');
                    renderGmailEmails();
                });
            });
        }

        function renderGmailEmails() {
            const emailList = gId('gmail-email-list');
            if (!emailList) return;

            let filteredEmails = gmailEmails;
            
            // Filter based on current folder
            if (currentGmailFolder === 'starred') {
                filteredEmails = gmailEmails.filter(email => email.starred);
            } else if (currentGmailFolder === 'sent') {
                filteredEmails = []; // No sent emails in demo
            } else if (currentGmailFolder === 'drafts') {
                filteredEmails = []; // No drafts in demo
            } else if (currentGmailFolder === 'trash') {
                filteredEmails = []; // No trash emails in demo
            }

            if (filteredEmails.length === 0) {
                emailList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #a0aec0;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 16px;">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                            <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <p>No emails in ${currentGmailFolder}</p>
                    </div>
                `;
                return;
            }

            emailList.innerHTML = filteredEmails.map(email => `
                <div class="gmail-email-item ${email.unread ? 'unread' : ''}" onclick="openGmailEmail(${email.id})">
                    <input type="checkbox" class="gmail-email-checkbox" onclick="event.stopPropagation()">
                    <div class="gmail-email-sender">${email.sender}</div>
                    <div class="gmail-email-subject">${email.subject}</div>
                    <div class="gmail-email-date">${email.date}</div>
                </div>
            `).join('');
        }

        function openGmailEmail(emailId) {
            const email = gmailEmails.find(e => e.id === emailId);
            if (!email) return;

            currentGmailEmail = email;
            
            // Mark as read
            email.unread = false;
            renderGmailEmails();

            const emailView = gId('gmail-email-view');
            const emailContent = gId('gmail-email-content');
            const emailList = gId('gmail-email-list');

            if (emailView && emailContent && emailList) {
                emailContent.innerHTML = `
                    <div class="gmail-email-meta">
                        <div class="gmail-email-from">
                            <div class="gmail-email-avatar">${email.sender.charAt(0)}</div>
                            <div class="gmail-email-sender-info">
                                <div class="gmail-email-sender-name">${email.sender}</div>
                                <div class="gmail-email-sender-email">&lt;${email.senderEmail}&gt;</div>
                            </div>
                            <div class="gmail-email-timestamp">${email.date}</div>
                        </div>
                        <div class="gmail-email-subject-line">${email.subject}</div>
                        <div class="gmail-email-to">to me</div>
                    </div>
                    <div class="gmail-email-body">${email.body}</div>
                `;

                emailList.style.display = 'none';
                emailView.style.display = 'flex';
            }
        }

        function closeGmailEmailView() {
            const emailView = gId('gmail-email-view');
            const emailList = gId('gmail-email-list');

            if (emailView && emailList) {
                emailView.style.display = 'none';
                emailList.style.display = 'block';
            }
        }

        function openGmailCompose() {
            const modal = gId('gmail-compose-modal');
            if (modal) {
                modal.classList.add('active');
                const toField = gId('gmail-compose-to');
                if (toField) toField.focus();
            }
        }

        function closeGmailCompose() {
            const modal = gId('gmail-compose-modal');
            if (modal) {
                modal.classList.remove('active');
                // Clear form
                const form = modal.querySelector('form');
                if (form) form.reset();
                // Hide CC/BCC fields
                const ccField = gId('gmail-cc-field');
                const bccField = gId('gmail-bcc-field');
                if (ccField) ccField.style.display = 'none';
                if (bccField) bccField.style.display = 'none';
            }
        }

        function minimizeGmailCompose() {
            showToast('Compose minimized (demo)', 'info');
        }

        function toggleGmailCC() {
            const ccField = gId('gmail-cc-field');
            if (ccField) {
                ccField.style.display = ccField.style.display === 'none' ? 'flex' : 'none';
            }
        }

        function toggleGmailBCC() {
            const bccField = gId('gmail-bcc-field');
            if (bccField) {
                bccField.style.display = bccField.style.display === 'none' ? 'flex' : 'none';
            }
        }

        // Enhanced email sending with animations
        let sendTimeout = null;
        let isSending = false;

        function sendGmailEmail(event) {
            event.preventDefault();
            if (isSending) return;
            
            const to = gId('gmail-compose-to').value;
            const subject = gId('gmail-compose-subject').value;
            const body = gId('gmail-compose-body').value;

            if (!to || !subject) {
                showToast('Please fill in recipient and subject fields', 'warning');
                return;
            }

            startEmailSendProcess(to, subject, body);
        }

        function startEmailSendProcess(to, subject, body) {
            isSending = true;
            
            // Show loading circle with cancel option
            const loadingCircle = gId('send-loading-circle');
            const overlay = gId('cancel-send-overlay');
            
            if (loadingCircle && overlay) {
                loadingCircle.classList.add('active');
                overlay.classList.add('active');
            }

            // Set 3-second timeout for auto-send
            sendTimeout = setTimeout(() => {
                completEmailSend(to, subject, body);
            }, 3000);
        }

        function cancelEmailSend() {
            if (sendTimeout) {
                clearTimeout(sendTimeout);
                sendTimeout = null;
            }
            
            isSending = false;
            
            // Hide loading elements
            const loadingCircle = gId('send-loading-circle');
            const overlay = gId('cancel-send-overlay');
            
            if (loadingCircle && overlay) {
                loadingCircle.classList.remove('active');
                overlay.classList.remove('active');
            }
            
            showToast('Email sending cancelled', 'info');
        }

        function completEmailSend(to, subject, body) {
            // Hide loading circle
            const loadingCircle = gId('send-loading-circle');
            const overlay = gId('cancel-send-overlay');
            
            if (loadingCircle && overlay) {
                loadingCircle.classList.remove('active');
                overlay.classList.remove('active');
            }

            // Show paper airplane animation
            const airplaneContainer = gId('paper-airplane-container');
            if (airplaneContainer) {
                airplaneContainer.classList.add('active');
                
                // Remove animation class after completion
                setTimeout(() => {
                    airplaneContainer.classList.remove('active');
                }, 3000);
            }

            // Play swoosh sound
            const swooshSound = gId('swoosh-sound');
            if (swooshSound) {
                swooshSound.play().catch(e => {
                    // Fallback if audio doesn't play (browser restrictions)
                    console.log('Audio play failed:', e);
                });
            }

            // Show success message
            setTimeout(() => {
                const successMessage = gId('email-success-message');
                if (successMessage) {
                    successMessage.classList.add('active');
                    
                    // Remove success message after animation
                    setTimeout(() => {
                        successMessage.classList.remove('active');
                    }, 2000);
                }
            }, 1500);

            // Close compose modal and reset
            setTimeout(() => {
                closeGmailCompose();
                isSending = false;
                showToast(`Email sent to ${to}!`, 'success');
            }, 2000);
        }

        function replyToCurrentEmail() {
            if (!currentGmailEmail) return;

            const replyModal = gId('gmail-reply-modal');
            const replyTo = gId('gmail-reply-to');
            const replySubject = gId('gmail-reply-subject');

            if (replyModal && replyTo && replySubject) {
                replyTo.value = currentGmailEmail.senderEmail;
                replySubject.value = `Re: ${currentGmailEmail.subject}`;
                replyModal.classList.add('active');
                
                const replyBody = gId('gmail-reply-body');
                if (replyBody) replyBody.focus();
            }
        }

        function closeGmailReply() {
            const modal = gId('gmail-reply-modal');
            if (modal) {
                modal.classList.remove('active');
                const form = modal.querySelector('form');
                if (form) form.reset();
            }
        }

        function minimizeGmailReply() {
            showToast('Reply minimized (demo)', 'info');
        }

        function sendGmailReply(event) {
            event.preventDefault();
            const to = gId('gmail-reply-to').value;
            const subject = gId('gmail-reply-subject').value;
            const body = gId('gmail-reply-body').value;

            showToast(`Reply sent to ${to}!`, 'success');
            closeGmailReply();
        }

        function forwardCurrentEmail() {
            if (!currentGmailEmail) return;
            
            const modal = gId('gmail-compose-modal');
            const subject = gId('gmail-compose-subject');
            const body = gId('gmail-compose-body');

            if (modal && subject && body) {
                subject.value = `Fwd: ${currentGmailEmail.subject}`;
                body.value = `\n\n---------- Forwarded message ----------\nFrom: ${currentGmailEmail.sender} <${currentGmailEmail.senderEmail}>\nSubject: ${currentGmailEmail.subject}\n\n${currentGmailEmail.body}`;
                modal.classList.add('active');
                
                const toField = gId('gmail-compose-to');
                if (toField) toField.focus();
            }
        }

        function deleteCurrentEmail() {
            if (!currentGmailEmail) return;
            
            if (confirm('Move this email to trash?')) {
                gmailEmails = gmailEmails.filter(email => email.id !== currentGmailEmail.id);
                showToast('Email moved to trash', 'success');
                closeGmailEmailView();
                renderGmailEmails();
            }
        }

        function starCurrentEmail() {
            if (!currentGmailEmail) return;
            
            currentGmailEmail.starred = !currentGmailEmail.starred;
            showToast(currentGmailEmail.starred ? 'Email starred' : 'Email unstarred', 'success');
            renderGmailEmails();
        }

        function refreshGmailEmails() {
            showToast('Emails refreshed', 'info');
            renderGmailEmails();
        }

        function deleteSelectedEmails() {
            const checkboxes = document.querySelectorAll('.gmail-email-checkbox:checked');
            if (checkboxes.length === 0) {
                showToast('No emails selected', 'warning');
                return;
            }
            
            if (confirm(`Delete ${checkboxes.length} selected email(s)?`)) {
                showToast(`${checkboxes.length} email(s) deleted`, 'success');
                renderGmailEmails();
            }
        }

        function markAsRead() {
            const checkboxes = document.querySelectorAll('.gmail-email-checkbox:checked');
            if (checkboxes.length === 0) {
                showToast('No emails selected', 'warning');
                return;
            }
            
            showToast(`${checkboxes.length} email(s) marked as read`, 'success');
            renderGmailEmails();
        }

        // Enhanced email compose function with animation
        function openEmailCompose(email = '', contactName = '') {
            // Switch to Gmail view if not already there
            if (CRMApp.currentView !== 'gmail') {
                showView('gmail');
                initializeGmail();
            }
            
            // Open compose modal with animation
            const modal = gId('gmail-compose-modal');
            if (modal) {
                modal.classList.add('active');
                
                // Pre-populate email if provided
                if (email) {
                    const toField = gId('gmail-compose-to');
                    if (toField) {
                        toField.value = email;
                    }
                }
                
                // Pre-populate subject with contact name if provided
                if (contactName) {
                    const subjectField = gId('gmail-compose-subject');
                    if (subjectField) {
                        subjectField.value = `Follow up with ${contactName}`;
                    }
                }
                
                // Focus on the body field if email is pre-populated, otherwise focus on email field
                setTimeout(() => {
                    const focusField = email ? gId('gmail-compose-body') : gId('gmail-compose-to');
                    if (focusField) focusField.focus();
                }, 500); // Wait for animation to complete
            }
        }

        // Update the main navigation setup to include Gmail
        const originalSetupNavigation = setupNavigation;
        setupNavigation = function() {
            originalSetupNavigation();
            
            // Add Gmail navigation
            const gmailSidebarItem = gId('sidebar-gmail');
            if (gmailSidebarItem) {
                gmailSidebarItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    showView('gmail');
                    initializeGmail();
                });
            }
        };

        // Update loadViewData to include Gmail
        const originalLoadViewData = loadViewData;
        loadViewData = function(viewName) {
            originalLoadViewData(viewName);
            if (viewName === 'gmail') {
                initializeGmail();
            }
        };

        // Enhanced comprehensive search functionality
        performGlobalSearch = function(query) {
            const resultsDiv = gId('nav-search-results');
            if (!query || query.length < 2) {
                if (resultsDiv) {
                    resultsDiv.innerHTML = '';
                    resultsDiv.classList.remove('active');
                }
                return;
            }
            
            const searchQuery = query.toLowerCase();
            let results = [];
            
            // Enhanced detection patterns
            const phoneRegex = /[\d\-\(\)\s\+\.]{7,}/;
            const isPhoneSearch = phoneRegex.test(query) || /^\d{10,}$/.test(query.replace(/\D/g, ''));
            const cleanQuery = query.replace(/\D/g, '');
            
            const emailRegex = /\S+@\S+\.\S+/;
            const isEmailSearch = emailRegex.test(query);
            
            const websiteRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
            const isWebsiteSearch = websiteRegex.test(query);
            
            // KWh usage search - detect numeric values for usage comparison
            const kwhRegex = /^\d+$/;
            const isKwhSearch = kwhRegex.test(query);
            const kwhValue = isKwhSearch ? parseInt(query) : 0;
            
            // Date search for contract expiration
            const dateRegex = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/;
            const isDateSearch = dateRegex.test(query);
            
            // Rate search ($/kWh format)
            const rateRegex = /^\d*\.?\d+$/;
            const isRateSearch = rateRegex.test(query) && parseFloat(query) < 1; // Rates are typically under $1/kWh
            const rateValue = isRateSearch ? parseFloat(query) : 0;
            
            // Enhanced account search with ALL fields
            const accountResults = CRMApp.accounts
                .filter(account => {
                    // Basic text fields
                    const nameMatch = account.name?.toLowerCase().includes(searchQuery);
                    const industryMatch = account.industry?.toLowerCase().includes(searchQuery);
                    const cityMatch = account.city?.toLowerCase().includes(searchQuery);
                    const stateMatch = account.state?.toLowerCase().includes(searchQuery);
                    const addressMatch = account.address?.toLowerCase().includes(searchQuery);
                    const websiteMatch = account.website?.toLowerCase().includes(searchQuery);
                    const painPointsMatch = account.painPoints?.toLowerCase().includes(searchQuery);
                    const benefitsMatch = account.benefits?.toLowerCase().includes(searchQuery);
                    
                    // Contract fields
                    const contractProviderMatch = account.contractProvider?.toLowerCase().includes(searchQuery);
                    const contractTypeMatch = account.contractType?.toLowerCase().includes(searchQuery);
                    
                    // Phone matching
                    let phoneMatch = false;
                    if (isPhoneSearch && account.phone && cleanQuery.length >= 3) {
                        const cleanPhone = account.phone.replace(/\D/g, '');
                        phoneMatch = cleanPhone.includes(cleanQuery) ||
                                   cleanQuery.includes(cleanPhone) ||
                                   cleanPhone.startsWith(cleanQuery) ||
                                   cleanPhone.endsWith(cleanQuery);
                    }
                    
                    // Website matching
                    let websiteSearchMatch = false;
                    if (isWebsiteSearch && account.website) {
                        websiteSearchMatch = account.website.toLowerCase().includes(searchQuery);
                    }
                    
                    // KWh usage matching (greater than or equal)
                    let kwhMatch = false;
                    if (isKwhSearch && account.annualkWh) {
                        const accountKwh = parseInt(account.annualkWh);
                        kwhMatch = accountKwh >= kwhValue;
                    }
                    
                    // Contract expiration date matching
                    let dateMatch = false;
                    if (isDateSearch && account.contractExpiration) {
                        dateMatch = account.contractExpiration.includes(query);
                    }
                    
                    // Rate matching (contract rate or sell rate)
                    let contractRateMatch = false;
                    if (isRateSearch) {
                        const contractRate = parseFloat(account.contractrate || 0);
                        const sellRate = parseFloat(account.sellrate || 0);
                        contractRateMatch = Math.abs(contractRate - rateValue) < 0.001 ||
                                          Math.abs(sellRate - rateValue) < 0.001;
                    }
                    
                    // Monthly bill matching
                    let billMatch = false;
                    if (!isRateSearch && !isKwhSearch && !isPhoneSearch && !isEmailSearch && !isDateSearch) {
                        const billAmount = parseFloat(account.monthlybill || 0);
                        const queryNum = parseFloat(query);
                        if (!isNaN(queryNum) && billAmount > 0) {
                            billMatch = Math.abs(billAmount - queryNum) < 50; // Within $50
                        }
                    }
                    
                    return nameMatch || industryMatch || cityMatch || stateMatch || addressMatch ||
                           websiteMatch || painPointsMatch || benefitsMatch || contractProviderMatch ||
                           contractTypeMatch || phoneMatch || websiteSearchMatch || kwhMatch ||
                           dateMatch || contractRateMatch || billMatch;
                })
                .slice(0, 5)
                .map(account => {
                    let matchInfo = `${account.industry || 'No Industry'} • ${account.city || ''} ${account.state || ''}`.trim();
                    
                    // Add specific match information
                    if (isKwhSearch && account.annualkWh) {
                        matchInfo += ` • ${parseInt(account.annualkWh).toLocaleString()} kWh/year`;
                    }
                    if (isRateSearch && (account.contractrate || account.sellrate)) {
                        matchInfo += ` • Rate: $${account.contractrate || account.sellrate}/kWh`;
                    }
                    if (account.contractExpiration && isDateSearch) {
                        matchInfo += ` • Expires: ${account.contractExpiration}`;
                    }
                    if (account.monthlybill && !isKwhSearch && !isRateSearch) {
                        const billAmount = parseFloat(account.monthlybill);
                        if (!isNaN(billAmount) && billAmount > 0) {
                            matchInfo += ` • $${billAmount.toLocaleString()}/month`;
                        }
                    }
                    
                    return {
                        id: account.id,
                        name: account.name,
                        info: matchInfo,
                        phone: account.phone,
                        website: account.website,
                        type: 'Account'
                    };
                });
            
            // Enhanced contact search
            const contactResults = CRMApp.contacts
                .filter(contact => {
                    const nameMatch = `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(searchQuery);
                    const titleMatch = contact.title?.toLowerCase().includes(searchQuery);
                    const accountMatch = contact.accountName?.toLowerCase().includes(searchQuery);
                    const emailMatch = contact.email?.toLowerCase().includes(searchQuery);
                    const notesMatch = contact.notes?.toLowerCase().includes(searchQuery);
                    
                    let phoneMatch = false;
                    if (isPhoneSearch && contact.phone && cleanQuery.length >= 3) {
                        const cleanPhone = contact.phone.replace(/\D/g, '');
                        phoneMatch = cleanPhone.includes(cleanQuery) ||
                                   cleanQuery.includes(cleanPhone) ||
                                   cleanPhone.startsWith(cleanQuery) ||
                                   cleanPhone.endsWith(cleanQuery);
                    }
                    
                    return nameMatch || titleMatch || accountMatch || emailMatch || notesMatch || phoneMatch;
                })
                .slice(0, 3)
                .map(contact => ({
                    id: contact.id,
                    name: `${contact.firstName} ${contact.lastName}`,
                    info: `${contact.title || 'No Title'} at ${contact.accountName || 'No Account'}`,
                    phone: contact.phone,
                    email: contact.email,
                    type: 'Contact'
                }));
            
            results = [...accountResults, ...contactResults];
            
            if (!resultsDiv) return;
            
            if (results.length === 0) {
                let noResultsMessage = 'No results found';
                if (isKwhSearch) {
                    noResultsMessage = `No accounts found with ${kwhValue.toLocaleString()}+ kWh annual usage`;
                } else if (isRateSearch) {
                    noResultsMessage = `No accounts found with $${rateValue}/kWh rate`;
                }
                resultsDiv.innerHTML = `<div class="nav-search-result">${noResultsMessage}</div>`;
                resultsDiv.classList.add('active');
                return;
            }
            
            let html = '';
            results.forEach(result => {
                html += `
                    <div class="nav-search-result" onclick="handleGlobalSearchClick('${result.id}', '${result.type.toLowerCase()}')">
                        <div class="nav-search-result-info">
                            <div class="nav-search-result-name">${result.name}</div>
                            <div class="nav-search-result-details">${result.info} • ${result.type}${result.phone ? ' • ' + result.phone : ''}${result.email ? ' • <span class="clickable-email" onclick="event.stopPropagation(); openEmailCompose(\'' + result.email + '\', \'' + result.name + '\')">' + result.email + '</span>' : ''}${result.website ? ' • ' + result.website : ''}</div>
                        </div>
                        <div class="nav-search-result-actions">
                            ${result.email ? `<button class="nav-search-call-btn" onclick="event.stopPropagation(); openEmailCompose('${result.email}', '${result.name}')" style="background: #1e40af; margin-right: 4px;">Email</button>` : ''}
                            ${result.type === 'Contact' ? `<button class="nav-search-call-btn" onclick="event.stopPropagation(); openCallsHubWithData('${result.id}')">Call</button>` : ''}
                        </div>
                    </div>
                `;
            });
            
            resultsDiv.innerHTML = html;
            resultsDiv.classList.add('active');
        };

        // Make Gmail functions globally available
        window.openGmailCompose = openGmailCompose;
        window.openEmailCompose = openEmailCompose;
        window.cancelEmailSend = cancelEmailSend;
        window.closeGmailCompose = closeGmailCompose;
        window.minimizeGmailCompose = minimizeGmailCompose;
        window.toggleGmailCC = toggleGmailCC;
        window.toggleGmailBCC = toggleGmailBCC;
        window.sendGmailEmail = sendGmailEmail;
        window.openGmailEmail = openGmailEmail;
        window.closeGmailEmailView = closeGmailEmailView;
        window.replyToCurrentEmail = replyToCurrentEmail;
        window.closeGmailReply = closeGmailReply;
        window.minimizeGmailReply = minimizeGmailReply;
        window.sendGmailReply = sendGmailReply;
        window.forwardCurrentEmail = forwardCurrentEmail;
        window.deleteCurrentEmail = deleteCurrentEmail;
        window.starCurrentEmail = starCurrentEmail;
        window.refreshGmailEmails = refreshGmailEmails;
        window.deleteSelectedEmails = deleteSelectedEmails;
        window.markAsRead = markAsRead;
        window.toggleReplyCC = toggleGmailCC;
        window.toggleReplyBCC = toggleGmailBCC;

        // ===== TASK MANAGEMENT SYSTEM =====
        
        // Task Management State
        const TaskManager = {
            tasks: [],
            notifications: [],
            currentView: 'calendar',
            currentDate: new Date(),
            userPreferences: {
                defaultView: 'calendar',
                reminderTime: 15,
                reminderSound: 'chime',
                taskRemindersEnabled: true,
                contractNotificationsEnabled: true,
                overdueNotifications: true,
                collaborationNotifications: true,
                milestoneNotifications: true
            },
            draggedTask: null,
            notificationSounds: {
                chime: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTuR2O/Eeyw'),
                bell: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTuR2O/Eeyw'),
                alert: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTuR2O/Eeyw'),
                melody: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTuR2O/Eeyw')
            }
        };

        // Load user preferences from localStorage
        function loadUserPreferences() {
            const saved = localStorage.getItem('taskManagerPreferences');
            if (saved) {
                TaskManager.userPreferences = { ...TaskManager.userPreferences, ...JSON.parse(saved) };
            }
            TaskManager.currentView = TaskManager.userPreferences.defaultView;
        }

        // Save user preferences to localStorage
        function saveUserPreferences() {
            localStorage.setItem('taskManagerPreferences', JSON.stringify(TaskManager.userPreferences));
        }

        // Initialize Task Management System
        function initializeTaskManager() {
            loadUserPreferences();
            setupTaskEventListeners();
            loadSampleTasks();
            renderCurrentView();
            initializeNotificationSystem();
            startNotificationChecks();
        }

        // Load sample tasks for demonstration
        function loadSampleTasks() {
            const sampleTasks = [
                {
                    id: '1',
                    title: 'Review Q1 Energy Contracts',
                    description: 'Review all energy contracts expiring in Q1 and prepare renewal recommendations',
                    priority: 'high',
                    status: 'pending',
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    project: 'Contract Management',
                    assignee: 'John Doe',
                    createdAt: new Date().toISOString()
                },
                {
                    id: '2',
                    title: 'Update CRM Contact Database',
                    description: 'Clean and update contact information in the CRM system',
                    priority: 'medium',
                    status: 'in-progress',
                    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                    project: 'CRM Maintenance',
                    assignee: 'Jane Smith',
                    createdAt: new Date().toISOString()
                },
                {
                    id: '3',
                    title: 'Prepare Monthly Sales Report',
                    description: 'Compile and analyze monthly sales data for management review',
                    priority: 'medium',
                    status: 'completed',
                    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    project: 'Reporting',
                    assignee: 'Mike Johnson',
                    createdAt: new Date().toISOString()
                }
            ];

            TaskManager.tasks = sampleTasks;
        }

        // Setup Event Listeners for Task Management
        function setupTaskEventListeners() {
            // View selector buttons
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const view = e.target.dataset.view;
                    switchTaskView(view);
                });
            });

            // Calendar navigation
            const prevBtn = document.getElementById('prev-month');
            const nextBtn = document.getElementById('next-month');
            const todayBtn = document.getElementById('today-btn');

            if (prevBtn) prevBtn.addEventListener('click', () => navigateMonth(-1));
            if (nextBtn) nextBtn.addEventListener('click', () => navigateMonth(1));
            if (todayBtn) todayBtn.addEventListener('click', () => goToToday());

            // Add task button
            const addTaskBtn = document.getElementById('add-task-btn');
            if (addTaskBtn) addTaskBtn.addEventListener('click', openTaskModal);

            // Task form submission
            const taskForm = document.getElementById('task-form');
            if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);

            // Notification bell
            const notificationBell = document.getElementById('notification-bell');
            if (notificationBell) {
                notificationBell.addEventListener('click', toggleNotificationDropdown);
            }

            // Close notification dropdown when clicking outside
            document.addEventListener('click', (e) => {
                const dropdown = document.getElementById('notification-dropdown');
                const bell = document.getElementById('notification-bell');
                if (dropdown && !dropdown.contains(e.target) && !bell.contains(e.target)) {
                    dropdown.classList.remove('active');
                }
            });
        }

        // Switch between task views
        function switchTaskView(viewName) {
            TaskManager.currentView = viewName;
            TaskManager.userPreferences.defaultView = viewName;
            saveUserPreferences();

            // Update view buttons
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === viewName);
            });

            // Update view containers
            document.querySelectorAll('.task-view').forEach(view => {
                view.classList.toggle('active', view.id === `${viewName}-view`);
            });

            renderCurrentView();
        }

        // Render current view
        function renderCurrentView() {
            switch (TaskManager.currentView) {
                case 'calendar':
                    renderCalendarView();
                    break;
                case 'list':
                    renderListView();
                    break;
                case 'kanban':
                    renderKanbanView();
                    break;
                case 'gantt':
                    renderGanttView();
                    break;
                case 'agenda':
                    renderAgendaView();
                    break;
            }
        }

        // Calendar View Functions
        function renderCalendarView() {
            const calendarGrid = document.getElementById('calendar-grid');
            if (!calendarGrid) return;

            const year = TaskManager.currentDate.getFullYear();
            const month = TaskManager.currentDate.getMonth();
            
            // Update month display
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            const currentMonthEl = document.getElementById('current-month');
            if (currentMonthEl) {
                currentMonthEl.textContent = `${monthNames[month]} ${year}`;
            }

            // Get first day of month and number of days
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startingDayOfWeek = firstDay.getDay();

            // Clear calendar
            calendarGrid.innerHTML = '';

            // Add day headers
            const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            dayHeaders.forEach(day => {
                const header = document.createElement('div');
                header.className = 'calendar-day-header';
                header.textContent = day;
                header.style.cssText = 'background: #4a5568; color: #cbd5e0; padding: 10px; text-align: center; font-weight: 600;';
                calendarGrid.appendChild(header);
            });

            // Add empty cells for days before month starts
            for (let i = 0; i < startingDayOfWeek; i++) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'calendar-day other-month';
                calendarGrid.appendChild(emptyDay);
            }

            // Add days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const dayElement = document.createElement('div');
                dayElement.className = 'calendar-day';
                
                const currentDate = new Date(year, month, day);
                const today = new Date();
                
                if (currentDate.toDateString() === today.toDateString()) {
                    dayElement.classList.add('today');
                }

                const dayNumber = document.createElement('div');
                dayNumber.className = 'day-number';
                dayNumber.textContent = day;
                dayElement.appendChild(dayNumber);

                const dayTasks = document.createElement('div');
                dayTasks.className = 'day-tasks';

                // Get tasks for this day
                const tasksForDay = TaskManager.tasks.filter(task => {
                    if (!task.dueDate) return false;
                    const taskDate = new Date(task.dueDate);
                    return taskDate.toDateString() === currentDate.toDateString();
                });

                // Add task elements
                tasksForDay.slice(0, 3).forEach(task => {
                    const taskElement = document.createElement('div');
                    taskElement.className = `calendar-task ${task.priority}-priority`;
                    taskElement.textContent = task.title;
                    taskElement.title = `${task.title} - ${task.status}`;
                    
                    if (new Date(task.dueDate) < today && task.status !== 'completed') {
                        taskElement.classList.add('overdue');
                    }

                    taskElement.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openTaskModal(task);
                    });

                    dayTasks.appendChild(taskElement);
                });

                // Show "more" indicator if there are additional tasks
                if (tasksForDay.length > 3) {
                    const moreElement = document.createElement('div');
                    moreElement.className = 'calendar-task-more';
                    moreElement.textContent = `+${tasksForDay.length - 3} more`;
                    moreElement.style.cssText = 'background: #6b7280; color: white; font-size: 0.6rem; text-align: center;';
                    dayTasks.appendChild(moreElement);
                }

                dayElement.appendChild(dayTasks);

                // Add click handler for day
                dayElement.addEventListener('click', () => {
                    openTaskModal(null, currentDate);
                });

                calendarGrid.appendChild(dayElement);
            }
        }

        function navigateMonth(direction) {
            TaskManager.currentDate.setMonth(TaskManager.currentDate.getMonth() + direction);
            renderCalendarView();
        }

        function goToToday() {
            TaskManager.currentDate = new Date();
            renderCalendarView();
        }

        // Task Modal Functions
        function openTaskModal(task = null, defaultDate = null) {
            const modal = document.getElementById('task-modal');
            const form = document.getElementById('task-form');
            const title = document.getElementById('task-modal-title');

            if (!modal || !form) return;

            // Reset form
            form.reset();

            if (task) {
                // Edit mode
                title.textContent = 'Edit Task';
                document.getElementById('task-title').value = task.title || '';
                document.getElementById('task-priority').value = task.priority || 'medium';
                document.getElementById('task-due-date').value = task.dueDate || '';
                document.getElementById('task-project').value = task.project || '';
                document.getElementById('task-assignee').value = task.assignee || '';
                document.getElementById('task-status').value = task.status || 'pending';
                document.getElementById('task-description').value = task.description || '';
                form.dataset.taskId = task.id;
            } else {
                // Add mode
                title.textContent = 'Add New Task';
                if (defaultDate) {
                    const dateString = defaultDate.toISOString().slice(0, 16);
                    document.getElementById('task-due-date').value = dateString;
                }
                delete form.dataset.taskId;
            }

            modal.classList.add('active');
        }

        function closeTaskModal() {
            const modal = document.getElementById('task-modal');
            if (modal) modal.classList.remove('active');
        }

        function handleTaskSubmit(event) {
            event.preventDefault();
            
            const form = event.target;
            const taskId = form.dataset.taskId;
            
            const taskData = {
                title: document.getElementById('task-title').value,
                priority: document.getElementById('task-priority').value,
                dueDate: document.getElementById('task-due-date').value,
                project: document.getElementById('task-project').value,
                assignee: document.getElementById('task-assignee').value,
                status: document.getElementById('task-status').value,
                description: document.getElementById('task-description').value
            };

            if (taskId) {
                // Update existing task
                const taskIndex = TaskManager.tasks.findIndex(t => t.id === taskId);
                if (taskIndex !== -1) {
                    TaskManager.tasks[taskIndex] = { ...TaskManager.tasks[taskIndex], ...taskData };
                    showToast('Task updated successfully!', 'success');
                }
            } else {
                // Create new task
                const newTask = {
                    id: Date.now().toString(),
                    ...taskData,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                TaskManager.tasks.push(newTask);
                showToast('Task created successfully!', 'success');
            }

            closeTaskModal();
            renderCurrentView();
        }

        // Notification System
        function initializeNotificationSystem() {
            updateNotificationBadge();
            renderNotificationFeed();
            
            // Add sample notifications
            addNotification({
                title: 'Contract Expiring Soon',
                message: 'ABC Corporation contract expires in 30 days',
                type: 'contract',
                urgent: true,
                actionable: true
            });
        }

        function addNotification(notification) {
            const newNotification = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                read: false,
                ...notification
            };

            TaskManager.notifications.unshift(newNotification);
            updateNotificationBadge();
            renderNotificationFeed();

            // Play sound if enabled
            if (TaskManager.userPreferences.taskRemindersEnabled) {
                playNotificationSound(notification.type || 'chime');
            }

            // Show visual indicator
            const bell = document.getElementById('notification-bell');
            if (bell) {
                bell.classList.add('has-notifications');
                setTimeout(() => bell.classList.remove('has-notifications'), 3000);
            }
        }

        function updateNotificationBadge() {
            const badge = document.getElementById('notification-badge');
            if (!badge) return;

            const unreadCount = TaskManager.notifications.filter(n => !n.read).length;
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        function renderNotificationFeed() {
            const feed = document.getElementById('notification-feed');
            if (!feed) return;

            if (TaskManager.notifications.length === 0) {
                feed.innerHTML = '<div class="empty-state">No notifications</div>';
                return;
            }

            feed.innerHTML = TaskManager.notifications.map(notification => `
                <div class="notification-item ${notification.read ? '' : 'unread'} ${notification.urgent ? 'urgent' : ''}"
                     onclick="handleNotificationClick('${notification.id}')">
                    <div class="notification-content">
                        <div class="notification-title">${notification.title}</div>
                        <div class="notification-message">${notification.message}</div>
                        <div class="notification-meta">
                            <span class="notification-time">${formatNotificationTime(notification.timestamp)}</span>
                            <div class="notification-actions">
                                ${notification.actionable ? `<button class="notification-action" onclick="handleNotificationAction('${notification.id}', event)">View</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        function toggleNotificationDropdown() {
            const dropdown = document.getElementById('notification-dropdown');
            if (dropdown) {
                dropdown.classList.toggle('active');
            }
        }

        function handleNotificationClick(notificationId) {
            const notification = TaskManager.notifications.find(n => n.id === notificationId);
            if (notification && !notification.read) {
                notification.read = true;
                updateNotificationBadge();
                renderNotificationFeed();
            }
        }

        function markAllNotificationsRead() {
            TaskManager.notifications.forEach(n => n.read = true);
            updateNotificationBadge();
            renderNotificationFeed();
        }

        function playNotificationSound(type) {
            const sound = TaskManager.notificationSounds[type];
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Could not play notification sound:', e));
            }
        }

        function formatNotificationTime(timestamp) {
            const now = new Date();
            const time = new Date(timestamp);
            const diffMs = now - time;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return time.toLocaleDateString();
        }

        // Start notification checks
        function startNotificationChecks() {
            // Check for task reminders every minute
            setInterval(checkTaskReminders, 60000);
            
            // Check for contract notifications daily
            setInterval(checkContractNotifications, 24 * 60 * 60 * 1000);
            
            // Initial checks
            checkTaskReminders();
            checkContractNotifications();
        }

        function checkTaskReminders() {
            if (!TaskManager.userPreferences.taskRemindersEnabled) return;

            const now = new Date();
            const reminderTime = TaskManager.userPreferences.reminderTime * 60 * 1000; // Convert to milliseconds

            TaskManager.tasks.forEach(task => {
                if (task.status === 'completed' || !task.dueDate) return;

                const dueDate = new Date(task.dueDate);
                const timeDiff = dueDate - now;

                // Check if we should send a reminder
                if (timeDiff > 0 && timeDiff <= reminderTime) {
                    const existingReminder = TaskManager.notifications.find(n =>
                        n.type === 'task-reminder' && n.taskId === task.id
                    );

                    if (!existingReminder) {
                        addNotification({
                            title: 'Task Reminder',
                            message: `"${task.title}" is due in ${Math.ceil(timeDiff / 60000)} minutes`,
                            type: 'task-reminder',
                            taskId: task.id,
                            urgent: task.priority === 'high',
                            actionable: true
                        });
                    }
                }
            });
        }

        function checkContractNotifications() {
            if (!TaskManager.userPreferences.contractNotificationsEnabled) return;

            // This would integrate with the existing CRM accounts data
            // For now, we'll create sample contract notifications
            const contractAlerts = [
                { months: 12, message: '12 months before expiration' },
                { months: 6, message: '6 months before expiration' },
                { months: 3, message: '3 months before expiration' },
                { months: 1, message: '1 month before expiration' },
                { weeks: 2, message: '2 weeks before expiration' }
            ];

            // This would check actual contract data from CRMApp.accounts
            // Sample implementation for demonstration
        }

        // Notification Settings Functions
        function openNotificationSettings() {
            const modal = document.getElementById('notification-settings-modal');
            if (modal) {
                // Populate current settings
                document.getElementById('task-reminder-enabled').checked = TaskManager.userPreferences.taskRemindersEnabled;
                document.getElementById('reminder-time').value = TaskManager.userPreferences.reminderTime;
                document.getElementById('reminder-sound').value = TaskManager.userPreferences.reminderSound;
                document.getElementById('contract-notifications-enabled').checked = TaskManager.userPreferences.contractNotificationsEnabled;
                document.getElementById('overdue-notifications').checked = TaskManager.userPreferences.overdueNotifications;
                document.getElementById('collaboration-notifications').checked = TaskManager.userPreferences.collaborationNotifications;
                document.getElementById('milestone-notifications').checked = TaskManager.userPreferences.milestoneNotifications;

                modal.classList.add('active');
            }
        }

        function closeNotificationSettings() {
            const modal = document.getElementById('notification-settings-modal');
            if (modal) modal.classList.remove('active');
        }

        function saveNotificationSettings() {
            TaskManager.userPreferences.taskRemindersEnabled = document.getElementById('task-reminder-enabled').checked;
            TaskManager.userPreferences.reminderTime = parseInt(document.getElementById('reminder-time').value);
            TaskManager.userPreferences.reminderSound = document.getElementById('reminder-sound').value;
            TaskManager.userPreferences.contractNotificationsEnabled = document.getElementById('contract-notifications-enabled').checked;
            TaskManager.userPreferences.overdueNotifications = document.getElementById('overdue-notifications').checked;
            TaskManager.userPreferences.collaborationNotifications = document.getElementById('collaboration-notifications').checked;
            TaskManager.userPreferences.milestoneNotifications = document.getElementById('milestone-notifications').checked;

            saveUserPreferences();
            closeNotificationSettings();
            showToast('Notification preferences saved!', 'success');
        }

        function testNotificationSound() {
            const soundType = document.getElementById('reminder-sound').value;
            playNotificationSound(soundType);
        }

        // Placeholder functions for other views (to be fully implemented)
        function renderListView() {
            const taskList = document.getElementById('task-list');
            if (!taskList) return;

            taskList.innerHTML = '<div style="padding: 50px; text-align: center; color: #cbd5e0;"><h3>List View</h3><p>Hierarchical task list with filtering and sorting</p></div>';
        }

        function renderKanbanView() {
            const kanbanBoard = document.getElementById('kanban-board');
            if (!kanbanBoard) return;

            kanbanBoard.innerHTML = '<div style="padding: 50px; text-align: center; color: #cbd5e0;"><h3>Kanban Board</h3><p>Drag-and-drop task management with swimlanes</p></div>';
        }

        function renderGanttView() {
            const ganttChart = document.getElementById('gantt-chart');
            if (!ganttChart) return;

            ganttChart.innerHTML = '<div style="padding: 50px; text-align: center; color: #cbd5e0;"><h3>Gantt Chart</h3><p>Timeline view with dependencies and critical path</p></div>';
        }

        function renderAgendaView() {
            const agendaTasks = document.getElementById('agenda-tasks');
            if (!agendaTasks) return;

            agendaTasks.innerHTML = '<div style="padding: 50px; text-align: center; color: #cbd5e0;"><h3>Agenda View</h3><p>Combined calendar and task list</p></div>';
        }

        // Global functions for event handlers
        window.closeTaskModal = closeTaskModal;
        window.closeNotificationSettings = closeNotificationSettings;
        window.saveNotificationSettings = saveNotificationSettings;
        window.testNotificationSound = testNotificationSound;
        window.handleNotificationAction = function(notificationId, event) {
            event.stopPropagation();
            handleNotificationClick(notificationId);
        };

        // Initialize when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            initializeApp();
            // Initialize task management after a short delay to ensure DOM is ready
            setTimeout(initializeTaskManager, 100);
        });
  