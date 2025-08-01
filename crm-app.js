// CRM Application Main JavaScript File
// Consolidated file for single-page application functionality

// Global state management
const CRMApp = {
    currentView: 'dashboard',
    currentAccount: null,
    currentContact: null,
    accounts: [],
    contacts: [],
    activities: []
};

// Global state for search functionality and current call data.
let currentSearchType = '';
let activeButton = null;
let currentProspect = {}; 

// Helper to get element by ID (saves characters and improves readability)
const gId = id => document.getElementById(id);

// Placeholder map for dynamic text in the call script.
const placeholders = {
    'N': '', // Contact Name
    'YN': 'Lewis', // Your Name (static)
    'CN': '', // Company Name
    'CI': '', // Company Industry
    'SB': '', // Specific Benefit
    'PP': '', // Pain Point
    'CT': '', // Contact Title
    'TIA': '', // Their Industry/Area (alias for CI)
    'TE': '', // Their Email (not directly from input)
    'DT': '', // Day/Time (not directly from input)
    'EAC': '', // Email Address Confirmed (not directly from input)
    'TF': '', // Timeframe (not directly from input)
    'OP': 'the responsible party', // Other Person (default)
    'XX': '$XX.00/40%' // Placeholder for dynamic % or amount
};

// Map input field IDs to the placeholder keys for automatic updates.
const inputMap = {
    'input-name': 'N',
    'input-title': 'CT',
    'input-company-name': 'CN',
    'input-company-industry': 'CI',
    'input-benefit': 'SB',
    'input-pain': 'PP'
};


// The main call script, structured as a state machine.
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
        you: "No answer. What would you like to do?",
        mood: "neutral",
        responses: [
            { text: "Leave Voicemail", next: "voicemail" },
            { text: "Hang Up / Start New Call", next: "start" }
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
    gatekeeper_whats_about: {
        you: "My name is Lewis with PowerChoosers.com and I'm needin' to speak with someone about the future electricity agreements for <strong>[CN]</strong>. Do you know who might be the best person for that?",
        mood: "neutral",
        responses: [
            { text: "🔗 I'll connect you", next: "transfer_dialing" },
            { text: "🚫 They're not available / Take a message", next: "voicemail" },
            { text: "✅ I can help you", next: "pathA" }
        ]
    },
    voicemail: {
        you: "Good afternoon/morning <strong>[N]</strong>, this is Lewis and I was told to speak with you. You can give me a call at 817-409-4215. Also, I shot you over a short email kinda explaining why I'm reaching out to you today. The email should be coming from Lewis Patterson that's (L.E.W.I.S) Thank you so much and you have a great day.",
        mood: "neutral",
        responses: [
            { text: "🔄 End Call / Start New Call", next: "start" }
        ]
    },
    pathA: {
        you: "Perfect <span class='pause'>--</span> So <strong>[N]</strong> I've been working closely with <strong>[CI]</strong> across Texas with electricity agreements <span class='pause'>--</span> and we're about to see an unprecedented dip in the market in the next few months <span class='pause'>--</span><br><br><strong><span class='emphasis'>Is getting the best price for your next renewal a priority for you and [CN]?</span></strong><br><br><strong><span class='emphasis'>Do you know when your contract expires?</span></strong><br><br><strong><span class='emphasis'>So since rates have gone up tremendously over the past 5 years, how are you guys handling such a sharp increase on your future renewals?</span></strong>",
        mood: "neutral",
        responses: [
            { text: "😰 Struggling / It's tough", next: "resStruggle" },
            { text: "📅 Haven't renewed / Contract not up yet", next: "resNotRenewed" },
            { text: "🔒 Locked in / Just renewed", next: "resLockedIn" },
            { text: "🛒 Shopping around / Looking at options", next: "resShopping" },
            { text: "🤝 Have someone handling it / Work with broker", next: "resBroker" },
            { text: "🤷 Haven't thought about it / It is what it is", next: "resNoThought" }
        ]
    },
    pathD: {
        you: "No worries if you're not sure. I work with Texas businesses on energy contract optimization <span class='pause'>--</span> basically helping companies navigate rate volatility and strategic positioning in our deregulated market. Does energy procurement fall under your area of responsibility, or would someone else be better positioned for this conversation?",
        mood: "unsure",
        responses: [
            { text: "✅ Yes, that's my responsibility", next: "pathA" },
            { text: "👥 Someone else handles it", next: "gatekeeper_intro" }
        ]
    },
    resStruggle: {
        you: "Yeah, I'm hearing that from a lot of <strong>[CT]</strong>. The thing is, most companies are approaching renewals the same way they did pre-2021, but the rules have completely changed. Do you currently have a strategy in place to help mitigate these increases?",
        mood: "challenging",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resNotRenewed: {
        you: "Actually, that timing works in your favor. Most businesses wait until 60-90 days before expiration to start looking, but with the market set to increase in 2026, people are reserving their rates in advance to avoid paying more in the future. Do you currently have a plan in place to <span class='pause'>--</span> mitigate these increases?",
        mood: "positive",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resLockedIn: {
        you: "Smart move getting locked in during this volatility. How long did you guys end up going with the term? Because here's what I'm seeing <span class='pause'>--</span> even with companies who just renewed, there are often optimization opportunities within existing contracts that most people don't know about. Plus, it gives us time to develop a strategic approach for your next cycle rather than scrambling when rates spike again.",
        mood: "neutral",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resShopping: {
        you: "Perfect timing then. Here's what I'm seeing though <span class='pause'>--</span> typically people just shop for rates but the rate is only about <span class='metric'>60%</span> of your bill if you're lucky. How are you guys evaluating the options <span class='pause'>--</span> just on rate, or are you looking at other ways to lower your final dollar amount?",
        mood: "positive",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resBroker: {
        you: "That's smart <span class='pause'>--</span> having someone who understands the Texas market is crucial right now. Have they let you know about ERCOT's supply concerns for 2026? Because there's some huge changes happening right now that could impact <strong>[CN]</strong>'s costs significantly. Would it be worth understanding what that looks like, even if you're happy with your current relationship?",
        mood: "neutral",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resNoThought: {
        you: "I get it <span class='pause'>--</span> energy's not the first thing you think about when you wake up. How much are you typically spending on energy? And if your bills were to increase by <span class='emphasis'>[XX]</span>, would that impact your budget at all? If I could show you what other companies are doing to reduce their spending, would you be open to discussing this further?",
        mood: "challenging",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    discovery: {
        you: "Gotcha! So <strong>[N]</strong>, Just so I understand your situation a little better. <span class='pause'>--</span> What's your current approach to renewing your electricity agreements <span class='pause'>--</span> do you handle it internally or work with a consultant?<br><br><strong><span class='emphasis'>And how that been?</span></strong><br><br><strong><span class='emphasis'>What is most concerning/important to you when it comes to energy?</span></strong><br><br><strong><span class='emphasis'>And how has that impacted you and [CN]?</span></strong><br><br>I watch the markets daily and here's what I'm seeing. Rates have gone up <span class='metric'>60%</span> since 2021 <span class='pause'>--</span> Most businesses <span class='pause'>--</span> <strong>they've taken an incredible hit</strong>, but many others have been able to find <strong>other ways</strong> to pay way less than other companies in their <strong>same area</strong>. If I could show you what they're doing, would you be open to talking about this further?",
        mood: "neutral",
        responses: [
            { text: "💚 Prospect is engaged / ready for appointment", next: "closeForAppointment" },
            { text: "🟡 Prospect is hesitant / needs more info", next: "handleHesitation" },
            { text: "❌ Objection: Happy with current provider", next: "objHappy" },
            { text: "❌ Objection: No time", next: "objNoTime" }
        ]
    },
    objHappy: {
        you: "That's actually great to hear, and I'm not suggesting you should be unhappy or you need to switch your supplier today. Is it the customer service that you're happy with or are you just getting a rate that you can't find anywhere else?",
        mood: "positive",
        responses: [
            { text: "💰 It's the rate / Great pricing", next: "objHappyRate" },
            { text: "🤝 Customer service / Overall experience", next: "objHappyService" },
            { text: "🔄 Both rate and service", next: "objHappyBoth" }
        ]
    },
    objHappyRate: {
        you: "That's awesome you locked in a great price, however, the rules of Texas Energy have completely changed over the past few years. Even satisfied clients I work with are <span class='pause'>--</span>shocked to find out they that their supplier's new rate is about <span class='metric'>15-25%</span> more than what they were paying before. Would it be worth re-evaluating where you're at now, just to make sure <strong>[CN]</strong> isn't left paying more than they should?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, worth understanding", next: "closeForAppointment" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    objHappyService: {
        you: "That's great - good service is hard to find. What I'm seeing though is that satisfaction with service and getting the best price are two separate conversations. The Texas energy market rules have changed significantly over the past few years. Even satisfied clients I work with discover they can can save <span class='metric'>15-25%</span> without sacrificing great customer service. Would it be worth looking into some options just to see if there is something more affordable for <strong>[CN]</strong>?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, worth understanding", next: "closeForAppointment" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    objHappyBoth: {
        you: "Perfect - that's exactly what you want. I have exclusive partnerships with the suppliers, so I can make them work 10 times harder for your business. If i can show you how to get better pricing and support for your energy, would that be helpful for you and <strong>[CN]</strong>?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, worth understanding", next: "closeForAppointment" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    objNoTime: {
        you: "I completely get it <span class='pause'>--</span> that's exactly why most businesses end up overpaying. Energy is a complicated market that requires ongoing attention that most internal teams <span class='pause'>--</span> simply don't have time for. Here's what I'd suggest <span class='pause'>--</span> give me <span class='emphasis'>10 minutes</span> to review your current setup <span class='pause'>--</span> against where we are today. And that should be able tell you exactly where you stand and what you should be expecting for the future. Would that be helpful for you?",
        mood: "challenging",
        responses: [
            { text: "✅ Yes, schedule 10-minute assessment", next: "scheduleAppointment" },
            { text: "❌ Still no time", next: "softClose" }
        ]
    },
    handleHesitation: {
        you: "I get it <span class='pause'>--</span> And called you out the blue so now is probably not the best time. How about this <span class='pause'>--</span> let me put together a quick case study specific to <span class='emphasis'>[TIA]</span>s in your area. Takes me about 10 minutes to prepare, it'll give you a snapshot into the market and it'll show you what other companies are doing to stay afloat in today's market.<br><br><strong><span class='emphasis'>Would that be useful for your future planning?</span></strong>",
        mood: "unsure",
        responses: [
            { text: "✅ Yes, send analysis", next: "getEmail" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    closeForAppointment: {
        you: "Awesome! So, <strong>[N]</strong><span class='pause'>--</span> I really believe you'll be able to benefit from <span class='emphasis'>[SB]</span> that way you won't have to <span class='emphasis'>[PP]</span>. Our process is super simple! We start with an <span class='emphasis'>energy health check</span> where I look at your usage, contract terms, and then we can talk about what options might look like for <strong>[CN]</strong> moving forward. It should take <span class='emphasis'>10-15 minutes</span> of your time. Would you prefer to connect this <span class='emphasis'>Friday morning around 11 AM</span>, or would <span class='emphasis'>Monday afternoon around 2 PM</span> work better for your schedule?",
        mood: "positive",
        responses: [
            { text: "📅 Schedule Friday 11 AM", next: "appointmentConfirmed" },
            { text: "📅 Schedule Monday 2 PM", next: "appointmentConfirmed" },
            { text: "🤔 Still hesitant", next: "getEmail" }
        ]
    },
    scheduleAppointment: {
        you: "Perfect! Let's get that <span class='emphasis'>10-minute market assessment</span> scheduled. I'll walk through your current situation, show you common supplier traps, and outline 2-3 strategic options based on your specific situation. Would <span class='emphasis'>Friday morning</span> or <span class='emphasis'>Monday afternoon</span> work better?",
        mood: "positive",
        responses: [
            { text: "📅 Friday morning works", next: "appointmentConfirmed" },
            { text: "📅 Monday afternoon works", next: "appointmentConfirmed" }
        ]
    },
    appointmentConfirmed: {
        you: "Perfect! I'll send you a calendar invite for <span class='emphasis'>[DT]</span>, and I'll put together some information specific to <span class='emphasis'>[TIA]</span> to give you better context for our meeting. Do you have a copy of your bill?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, I have a copy", next: "billYes" },
            { text: "❌ No, I don't have one readily available", next: "billNo" }
        ]
    },
    billYes: {
        you: "Perfect! I'm going to also send you a standard invoice request. Could you reply back with a recent copy?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, I can send that", next: "confirmEmail" },
            { text: "❌ I'd prefer not to share that", next: "billOptional" }
        ]
    },
    billNo: {
        you: "No problem. How do you typically receive your bills <span class='pause'>--</span> physical copy or through email?",
        mood: "positive",
        responses: [
            { text: "📧 Through email", next: "billEmailAdvice" },
            { text: "📄 Physical copy", next: "billPhysicalAdvice" }
        ]
    },
    billEmailAdvice: {
        you: "Perfect! Be sure to have a copy ready for us to go over at <span class='emphasis'>[DT]</span>. You should be able to find it in your email from your provider. Looking forward to our conversation!",
        mood: "positive",
        responses: [
            { text: "✅ Sounds great - end call", next: "callSuccess" }
        ]
    },
    billPhysicalAdvice: {
        you: "Perfect! Be sure to have a copy ready for us to go over at <span class='emphasis'>[DT]</span>. If you can find your most recent physical bill, that would be ideal for our review. Looking forward to our conversation!",
        mood: "positive",
        responses: [
            { text: "✅ Sounds great - end call", next: "callSuccess" }
        ]
    },
    confirmEmail: {
        you: "Excellent! So I have your email as <span class='emphasis'>[TE]</span> <span class='pause'>--</span> is that correct? I'll send both the calendar invite and the invoice request to that address. You should receive them within the next few minutes. Looking forward to our conversation at <span class='emphasis'>[DT]</span>!",
        mood: "positive",
        responses: [
            { text: "✅ Email confirmed - end call", next: "callSuccess" },
            { text: "❌ Different email address", next: "getCorrectEmail" }
        ]
    },
    getCorrectEmail: {
        you: "No problem! What's the best email address for you?",
        mood: "positive",
        responses: [
            { text: "📧 Provide correct email", next: "emailConfirmed" }
        ]
    },
    emailConfirmed: {
        you: "Perfect! I'll send the calendar invite and invoice request to <span class='emphasis'>[EAC]</span>. You should receive them within the next few minutes. Looking forward to our conversation at <span class='emphasis'>[DT]</span>!",
        mood: "positive",
        responses: [
            { text: "✅ All set - end call", next: "callSuccess" }
        ]
    },
    billOptional: {
        you: "No worries at all! Having a bill helps with the analysis, but we can still have a productive conversation without it. I'll send you the calendar invite for <span class='emphasis'>[DT]</span> and some industry-specific information. Looking forward to our conversation!",
        mood: "positive",
        responses: [
            { text: "✅ Sounds good - end call", next: "callSuccess" }
        ]
    },
    getEmail: {
        you: "Great! I'll put together a quick case study specific to <span class='emphasis'>[TIA]</span>. It takes me about 10 minutes to prepare, and it'll give you a baseline understanding of where your company stands competitively. I can email that over by tomorrow, and if you see value in diving deeper, we can schedule a brief follow-up. What's a good email for you?",
        mood: "unsure",
        responses: [
            { text: "✅ Yes, send analysis", next: "emailFollowUp" },
            { text: "❌ Don't want to provide email", next: "softClose" }
        ]
    },
    emailFollowUp: {
        you: "Perfect! I've got <span class='emphasis'>[EAC]</span>. I'll get that market analysis over to you by <span class='emphasis'>[TF]</span>, and it'll give you a good baseline for understanding your competitive position. If you have any immediate questions before then, feel free to reach out. Otherwise, I'll follow up once you've had a chance to review the information. Sound good?",
        mood: "positive",
        responses: [
            { text: "✅ Sounds good - end call", next: "callSuccess" }
        ]
    },
    softClose: {
        you: "No problem at all <span class='pause'>--</span> I know energy strategy isn't urgent until it becomes critical. Here's what I'll do: I'm going to add you to my <span class='emphasis'>quarterly market intelligence updates</span>. These go out to CFOs and facilities managers across Texas and include trend analysis, regulatory updates, and strategic insights. <span class='emphasis'>No sales content, just market intelligence</span> that helps you stay informed. If market conditions create opportunities that make sense for <span class='emphasis'>[CN]</span>, I'll reach out. Sound reasonable?",
        mood: "neutral",
        responses: [
            { text: "✅ That sounds reasonable", next: "callSuccess" },
            { text: "❌ No thanks", next: "callEnd" }
        ]
    },
    callSuccess: {
        you: "🎉 <strong>Call Completed Successfully!</strong><br><br>Remember to track:<br>• Decision maker level<br>• Current contract status and timeline<br>• Pain points identified<br>• Interest level (Hot/Warm/Cold/Future)<br>• Next action committed<br>• Best callback timing<br><br><span class='emphasis'>Great job keeping the energy high and positioning as a strategic advisor!</span>",
        mood: "positive",
        responses: [
            { text: "🔄 Start New Call", next: "start", action: "saveProspectAndNotes" }
        ]
    },
    callEnd: {
        you: "Thanks for your time. Have a great day!",
        mood: "neutral",
        responses: [
            { text: "🔄 Start New Call", next: "start" }
        ]
    },
    transfer_dialing: {
        you: "Being transferred... Ringing...",
        mood: "neutral",
        responses: [
            { text: "📞 Decision Maker Answers", next: "main_script_start" },
            { text: "🚫 No Answer", next: "voicemail_or_hangup" }
        ]
    }
};

let currentStep = 'start';
let history = [];
let scriptDisplay, responsesContainer, backBtn;

function populateFromURL() {
    // This function is no longer needed since the app is a single page app.
    // The data is passed via the openCallsHubWithData function instead of URL parameters.
}

function populateFromGlobalProspect() {
    const inputName = gId('input-name');
    if (inputName) {
        inputName.value = currentProspect.name || '';
        placeholders['N'] = currentProspect.name || '';
    }
    const inputTitle = gId('input-title');
    if (inputTitle) {
        inputTitle.value = currentProspect.title || '';
        placeholders['CT'] = currentProspect.title || '';
    }
    const inputCompanyName = gId('input-company-name');
    if (inputCompanyName) {
        inputCompanyName.value = currentProspect.company || '';
        placeholders['CN'] = currentProspect.company || '';
    }
    const inputCompanyIndustry = gId('input-company-industry');
    if (inputCompanyIndustry) {
        inputCompanyIndustry.value = currentProspect.industry || '';
        placeholders['CI'] = currentProspect.industry || '';
        placeholders['TIA'] = currentProspect.industry || '';
    }
    const inputBenefit = gId('input-benefit');
    if (inputBenefit) {
        inputBenefit.value = currentProspect.benefits || '';
        placeholders['SB'] = currentProspect.benefits || '';
    }
    const inputPain = gId('input-pain');
    if (inputPain) {
        inputPain.value = currentProspect.painPoints || '';
        placeholders['PP'] = currentProspect.painPoints || '';
    }
    
    // Check if coming from a contact and disable fields
    const fieldsToDisable = ['input-name', 'input-title', 'input-company-name', 'input-company-industry'];
    if (currentProspect.contactId) {
        fieldsToDisable.forEach(fieldId => {
            const input = gId(fieldId);
            if (input) {
                input.disabled = true;
            }
        });
    } else {
        fieldsToDisable.forEach(fieldId => {
            const input = gId(fieldId);
            if (input) {
                input.disabled = false;
            }
        });
    }
}

async function saveCallNotesToCRM() {
    // This function is no longer used directly as saveProspectAndNotes is the new entry point
}

function applyPlaceholders(text) {
    let newText = text;
    for (const key in placeholders) {
        const regex = new RegExp('\\[' + key + '\\]', 'g');
        newText = newText.replace(regex, placeholders[key]);
    }
    return newText;
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

function displayCurrentStep() {
    const step = scriptData[currentStep];
    if (!step) return;
    
    scriptDisplay = gId('script-display');
    responsesContainer = gId('responses-container');
    backBtn = gId('back-btn');
    
    const processedText = applyPlaceholders(step.you);
    
    if (scriptDisplay) {
        scriptDisplay.innerHTML = processedText;
        scriptDisplay.className = `script-display mood-${step.mood}`;
    }
    
    if (responsesContainer) {
        responsesContainer.innerHTML = '';
        if (currentStep === 'start' && currentProspect.phone) {
            const dialButtonHtml = `
                <button class="dial-button" onclick="handleDialClick()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    Dial
                </button>
            `;
            responsesContainer.innerHTML = dialButtonHtml;
        } else if (currentStep === 'start') {
            responsesContainer.innerHTML = `
                <button class="dial-button" onclick="handleDialClick()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    Dial
                </button>
            `;
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

    populateFromGlobalProspect();
}

function handleDialClick() {
    if (currentProspect.phone) {
        // Here we're using a simple alert to show the dialing functionality,
        // as you requested to not open the native phone app for now.
        alert(`Dialing ${currentProspect.phone}...`);
    } else {
        showToast('No phone number available for this prospect. Manual dialing is required.', 'info');
    }
    selectResponse('dialing');
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
    if (callNotesElement) {
        callNotesElement.value = '';
    }
    
    currentProspect = {
        name: '',
        title: '',
        company: '',
        industry: '',
        phone: '',
        email: '',
        accountId: '',
        contactId: '',
        painPoints: '',
        benefits: ''
    };
    
    const inputs = ['input-name', 'input-title', 'input-company-name', 'input-company-industry', 'input-benefit', 'input-pain'];
    inputs.forEach(inputId => {
        const input = gId(inputId);
        if (input) {
            input.value = '';
            input.disabled = false;
        }
    });
    
    displayCurrentStep();
}

function copyNotes() {
    const notesTextarea = gId('call-notes');
    const statusDiv = gId('copy-status');
    
    if (!notesTextarea || !statusDiv) return;
    
    notesTextarea.select();
    try {
        document.execCommand('copy');
        statusDiv.textContent = '✅ Notes copied to clipboard!';
        statusDiv.style.opacity = '1';
        setTimeout(() => statusDiv.style.opacity = '0', 3000);
    } catch (err) {
        statusDiv.textContent = '❌ Copy failed';
        statusDiv.style.color = '#ef4444';
        statusDiv.style.opacity = '1';
        setTimeout(() => {
            statusDiv.style.opacity = '0';
            statusDiv.style.color = '#22c55e';
        }, 3000);
    }
}

function clearNotes() {
    const notesTextarea = gId('call-notes');
    const statusDiv = gId('copy-status');
    
    if (!notesTextarea || !statusDiv) return;

    if (confirm('Are you sure you want to clear all notes?')) {
        notesTextarea.value = '';
        statusDiv.textContent = '🗑️ Notes cleared';
        statusDiv.style.opacity = '1';
        setTimeout(() => statusDiv.style.opacity = '0', 2000);
    }
}

// --- Search Functions ---
function setupSearchFunctionality() {
    const googleBtn = gId('google-button');
    if (googleBtn) {
        googleBtn.addEventListener('click', (e) => openSearch('google', e));
    }
    const mapsBtn = gId('maps-button');
    if (mapsBtn) {
        mapsBtn.addEventListener('click', (e) => openSearch('maps', e));
    }
    const apolloBtn = gId('apollo-button');
    if (apolloBtn) {
        apolloBtn.addEventListener('click', (e) => openSearch('apollo', e));
    }
    const beenverifiedBtn = gId('beenverified-button');
    if (beenverifiedBtn) {
        beenverifiedBtn.addEventListener('click', (e) => openSearch('beenverified', e));
    }

    ['search-input', 'search-city', 'search-state', 'search-location'].forEach(id => {
        const input = gId(id);
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') performSearch();
            });
        }
    });
}

function openSearch(type, event) {
    const button = event.target.closest('.app-button');
    const searchBar = gId('search-bar');
    const mainContainer = gId('main-container');

    if (currentSearchType === type && activeButton === button) {
        closeSearch();
        return;
    }
    
    if (activeButton) activeButton.classList.remove('active');
    currentSearchType = type;
    activeButton = button;
    button.classList.add('active');
    
    const label = gId('search-label');
    const input = gId('search-input');
    const cityInput = gId('search-city');
    const stateInput = gId('search-state');
    const locationInput = gId('search-location');
    
    if (!label || !input) return;
    
    if (cityInput) cityInput.style.display = 'none';
    if (stateInput) stateInput.style.display = 'none';
    if (locationInput) locationInput.style.display = 'none';
    
    if (type === 'google') {
        label.textContent = 'Search Google:';
        input.placeholder = 'Type your search query...';
    } else if (type === 'maps') {
        label.textContent = 'Search Maps:';
        input.placeholder = 'Search places, addresses, businesses...';
    } else if (type === 'beenverified') {
        label.textContent = 'Search BeenVerified:';
        input.placeholder = 'Enter full name (e.g. John Smith)...';
        if (cityInput) cityInput.style.display = 'block';
        if (stateInput) stateInput.style.display = 'block';
    } else if (type === 'apollo') {
        label.textContent = 'Search Apollo:';
        input.placeholder = 'Enter name (e.g. Lewis Patterson)...';
        if (locationInput) locationInput.style.display = 'block';
    }
    
    if (searchBar) searchBar.classList.add('active');
    if (mainContainer) {
        mainContainer.classList.add('search-active');
    }
    setTimeout(() => input.focus(), 300);
    input.value = '';
    if (cityInput) cityInput.value = '';
    if (stateInput) stateInput.value = '';
    if (locationInput) locationInput.value = '';
}

function closeSearch() {
    const searchBar = gId('search-bar');
    const mainContainer = gId('main-container');
    if (searchBar) {
        searchBar.classList.remove('active');
    }
    if (mainContainer) {
        mainContainer.classList.remove('search-active');
    }
    if (activeButton) {
        activeButton.classList.remove('active');
        activeButton = null;
    }
    currentSearchType = '';
}

function performSearch() {
    const query = gId('search-input').value.trim();
    if (!query) return;
    
    let searchUrl = '';
    
    if (currentSearchType === 'google') {
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    } else if (currentSearchType === 'maps') {
        searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    } else if (currentSearchType === 'beenverified') {
        const city = gId('search-city').value.trim();
        const state = gId('search-state').value.trim().toUpperCase();
        const nameParts = query.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        searchUrl = `https://www.beenverified.com/rf/search/v2?age=0&city=${encodeURIComponent(city)}&fullname=${encodeURIComponent(query)}&fname=${encodeURIComponent(firstName)}&ln=${encodeURIComponent(lastName)}&mn=&state=${encodeURIComponent(state)}&title=&company=&industry=&level=&companySizeMin=1&companySizeMax=9&birthMonth=&birthYear=&deathMonth=&deathYear=&address=&isDeceased=false&location=&country=&advancedSearch=true&eventType=none&eventMonth=&eventYear=&source=personSearch,familySearch,obituarySearch,deathIndexSearch,contactSearch`;
    } else if (currentSearchType === 'apollo') {
        const location = gId('search-location').value.trim();
        let apolloUrl = `https://app.apollo.io/#/people?page=1&qKeywords=${encodeURIComponent(query + ' ')}`;
        if (location) apolloUrl += `&personLocations[]=${encodeURIComponent(location)}`;
        searchUrl = apolloUrl;
    }
    
    if (searchUrl) {
        window.open(searchUrl, '_blank');
        closeSearch();
    }
}
