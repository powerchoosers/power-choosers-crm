(function(){
  'use strict';

  // Simple decision-tree for Call Scripts page (sanitized, no emojis, no dynamic placeholders)
  const FLOW = {
    start: {
      text: "Click 'Dial' to begin the call.",
      responses: []
    },
    dialing: {
      text: 'Dialing... Ringing...',
      responses: [
        { label: 'Call connected', next: 'hook' },
        { label: 'Transferred - decision maker answers', next: 'main_script_start' },
        { label: 'No answer', next: 'voicemail_or_hangup' }
      ]
    },
    voicemail_or_hangup: {
      text: 'No answer. What would you like to do?',
      responses: [
        { label: 'Leave voicemail', next: 'voicemail' },
        { label: 'Hang up / start new call', next: 'start' }
      ]
    },
    hook: {
      text: 'Hi, is this there?',
      responses: [
        { label: 'Yes, this is', next: 'main_script_start' },
        { label: 'Speaking', next: 'main_script_start' },
        { label: "Who's calling?", next: 'main_script_start' },
        { label: 'Gatekeeper / not the right person', next: 'gatekeeper_intro' }
      ]
    },
    main_script_start: {
      text: "Good morning/afternoon — I'm Lewis with PowerChoosers and I need to speak with someone over electricity agreements and contracts for your company — would that be yourself?",
      responses: [
        { label: "Yes, that's me / I handle that", next: 'pathA' },
        { label: 'That would be someone else / not the right person', next: 'gatekeeper_intro' },
        { label: 'We both handle it / team decision', next: 'pathA' },
        { label: 'Unsure or hesitant', next: 'pathD' } // pathD not explicitly defined in source; route to discovery instead
      ]
    },
    gatekeeper_intro: {
      text: 'Good afternoon/morning. I am looking to speak with someone over electricity agreements and contracts for your company — do you know who would be responsible for that?',
      responses: [
        { label: "What's this about?", next: 'gatekeeper_whats_about' },
        { label: "I'll connect you", next: 'transfer_dialing' },
        { label: "They're not available / take a message", next: 'voicemail' }
      ]
    },
    gatekeeper_whats_about: {
      text: 'My name is Lewis with PowerChoosers.com and I am looking to speak with someone about the future electricity agreements for your company. Who would be the best person for that?',
      responses: [
        { label: "I'll connect you", next: 'transfer_dialing' },
        { label: "They're not available / take a message", next: 'voicemail' },
        { label: 'I can help you', next: 'pathA' }
      ]
    },
    voicemail: {
      text: 'Good afternoon/morning, this is Lewis. Please call me at 817-409-4215. I also sent a short email explaining why I am reaching out today. Thank you and have a great day.',
      responses: [
        { label: 'End call / start new call', next: 'start' }
      ]
    },
    pathA: {
      text: "Perfect — I've been working closely with companies like yours across Texas on electricity agreements — and we are expecting a potential dip in the market in the next few months — Is getting the best price for your next renewal a priority for you and your company? Do you know when your contract expires?",
      responses: [
        { label: "It's tough / struggling", next: 'discovery' },
        { label: 'Have not renewed / contract not up yet', next: 'discovery' },
        { label: 'Locked in / just renewed', next: 'discovery' },
        { label: 'Shopping around / looking at options', next: 'discovery' },
        { label: 'Have someone handling it / work with broker', next: 'discovery' },
        { label: "Haven't thought about it / it is what it is", next: 'discovery' }
      ]
    },
    discovery: {
      text: 'Got it. Just so I understand your situation a little better — What is your current approach to renewing your electricity agreements: do you handle it internally or work with a consultant?',
      responses: [
        { label: 'Prospect is engaged / ready for appointment', next: 'closeForAppointment' },
        { label: 'Prospect is hesitant / needs more info', next: 'handleHesitation' },
        { label: 'Objection: happy with current provider', next: 'objHappy' },
        { label: 'Objection: no time', next: 'objNoTime' }
      ]
    },
    closeForAppointment: {
      text: "Awesome — I believe you'll benefit from a more strategic procurement approach so you don't pay more than necessary. Our process is simple: we start with an energy health check to review usage and contract terms, then discuss options for your company.",
      responses: [
        { label: 'Schedule Friday 11 AM', next: 'callSuccess' },
        { label: 'Schedule Monday 2 PM', next: 'callSuccess' },
        { label: 'Still hesitant', next: 'handleHesitation' }
      ]
    },
    handleHesitation: {
      text: 'I understand — I called you out of the blue and now might not be the best time. How about I put together a quick case study specific to companies like yours in your area?',
      responses: [
        { label: 'Yes, send analysis', next: 'callSuccess' },
        { label: 'No, not interested', next: 'softClose' }
      ]
    },
    objHappy: {
      text: "That's great to hear, and I'm not suggesting you need to switch providers today. Is it the customer service you value most, or are you getting a rate that's difficult to beat?",
      responses: [
        { label: 'Yes, worth understanding', next: 'closeForAppointment' },
        { label: 'No, not interested', next: 'softClose' }
      ]
    },
    objNoTime: {
      text: "I completely understand — that's exactly why many businesses end up overpaying. Energy is a complex market that requires ongoing attention that internal teams often do not have time for.",
      responses: [
        { label: 'Schedule 10-minute assessment', next: 'callSuccess' },
        { label: 'Still no time', next: 'softClose' }
      ]
    },
    softClose: {
      text: "No problem — energy strategy rarely feels urgent until it becomes critical. I'll add you to quarterly market updates.",
      responses: [
        { label: 'That sounds reasonable', next: 'callSuccess' },
        { label: 'No thanks', next: 'callEnd' }
      ]
    },
    callSuccess: {
      text: 'Call completed successfully. Remember to track: decision maker level; current contract status; pain points identified; interest level; next action committed.',
      responses: [
        { label: 'Start new call', next: 'start' }
      ]
    },
    callEnd: {
      text: 'Thanks for your time. Have a great day!',
      responses: [
        { label: 'Start new call', next: 'start' }
      ]
    },
    transfer_dialing: {
      text: 'Connecting... Ringing...',
      responses: [
        { label: 'Call connected', next: 'hook' },
        { label: 'Not connected', next: 'voicemail' }
      ]
    },
    // Fallback for pathD in original flow: route to discovery
    pathD: {
      text: 'Understood. Let me ask a quick question to make sure this is relevant — What is your current approach to renewals: handled internally or with a consultant?',
      responses: [
        { label: 'Continue', next: 'discovery' }
      ]
    }
  };

  let state = {
    current: 'start',
    history: []
  };

  // Elements
  function els(){
    return {
      display: document.getElementById('call-scripts-display'),
      responses: document.getElementById('call-scripts-responses'),
      backBtn: document.getElementById('call-scripts-back'),
      restartBtn: document.getElementById('call-scripts-restart')
    };
  }

  function render(){
    const { display, responses, backBtn } = els();
    const node = FLOW[state.current] || FLOW.start;

    if (display){
      // Use textContent to avoid injecting HTML; keep text simple
      display.textContent = node.text || '';
    }

    if (responses){
      responses.innerHTML = '';
      responses.classList.remove('full-width');

      if (state.current === 'start'){
        const btn = document.createElement('button');
        btn.className = 'dial-btn';
        btn.type = 'button';
        btn.textContent = 'Dial';
        btn.addEventListener('click', () => go('dialing'));
        responses.appendChild(btn);
        responses.classList.add('full-width');
      } else {
        (node.responses || []).forEach(r => {
          const b = document.createElement('button');
          b.className = 'response-btn';
          b.type = 'button';
          b.textContent = r.label;
          b.addEventListener('click', () => go(r.next));
          responses.appendChild(b);
        });
        if ((node.responses || []).length === 1) responses.classList.add('full-width');
      }
    }

    if (backBtn){
      backBtn.disabled = state.history.length === 0;
    }
  }

  function go(next){
    if (!next || !FLOW[next]) return;
    state.history.push(state.current);
    state.current = next;
    render();
  }

  function back(){
    if (state.history.length === 0) return;
    state.current = state.history.pop();
    render();
  }

  function restart(){
    state.current = 'start';
    state.history = [];
    render();
  }

  function bind(){
    const { backBtn, restartBtn } = els();
    if (backBtn && !backBtn._bound){ backBtn.addEventListener('click', back); backBtn._bound = true; }
    if (restartBtn && !restartBtn._bound){ restartBtn.addEventListener('click', restart); restartBtn._bound = true; }
  }

  function init(){
    bind();
    // Reset state when the page is shown
    restart();
  }

  // Expose module
  if (!window.callScriptsModule) window.callScriptsModule = {};
  window.callScriptsModule.init = init;
  
  // Eager init if user is already on the Call Scripts page at load
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const page = document.getElementById('call-scripts-page');
      if (page && page.classList.contains('active')) {
        init();
      }
    } catch (_) { /* noop */ }
  });
})();
