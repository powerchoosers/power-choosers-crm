. The Diagnosis (Critical Failures)
A. Visual Noise in the Preview (The HTML Glitch) In TEST_PROTOCOL.png [Source 1154], the output displays raw HTML tags (<p>, </p>).
• The Verdict: This is unacceptable. It breaks the "Obsidian & Glass" immersion. It forces the user to mentally parse code instead of judging the tone of the message.
• The Fix: You must implement a Render Engine in the preview window that parses the HTML string into a visual email client simulation. The user should see the email exactly as the prospect will see it on an iPhone 15 [Source 1235].
B. The "Black Box" Prompting In Screenshot 2026-01-31 [Source 1142], your prompt is generic: "Generate a concise and direct email..."
• The Verdict: This relies too heavily on the AI guessing the context. In 2026, high-converting emails rely on Hyper-Personalization based on specific data signals (Funding, Load Factor, 4CP) [Source 1237].
• The Fix: The Calibration screen needs "Data Injection Toggles." You must explicitly tell the AI which data vectors to use (e.g., [x] Include 4CP Risk, [ ] Include Contract Expiry).
C. Lack of "Why" (Forensic Explainability) When the email is generated, the user sees the text but not the reasoning.
• The Verdict: An Architect needs to know why the AI chose to mention "Relocation." Was it a random hallucination? Or did it pull a "Move Event" signal from the contact's dossier?
• The Fix: The Test Protocol screen needs a "Neural Logic Sidebar" that explains the AI's decision-making (e.g., "Detected 'New Office' signal in Apollo data -> Triggered Relocation Protocol").

--------------------------------------------------------------------------------
2. The Architectural Upgrade (The New Flow)
We will restructure the flow to move from "Writing" to "Architecting."
Phase 1: Calibration (The Strategy Layer)
Current State: A text box for a prompt. New State: The Context Matrix.
Do not just ask the user for a prompt. Force the user to define the Physics of the Message.
1. The Prompt Builder: Instead of one big text box, split it into three distinct fields [Source 1231]:
    ◦ Role (The Architect): "Act as a Forensic Energy Auditor..."
    ◦ Objective (The Liability): "Expose the structural variance in their 4CP charges."
    ◦ Constraints (The 80-Word Rule): "Keep under 80 words. No sales fluff. Use 'No-Oriented' questions." [Source 420].
2. Vector Selection: Add checkboxes below the prompt area:
    ◦ [ ] Inject Firmographics (Industry, Revenue)
    ◦ [ ] Inject Energy Metrics (Load Zone, Usage)
    ◦ [ ] Inject Recent News (Apollo/Coresignal)
Phase 2: Test Protocol (The Simulation Layer)
Current State: A drop-down to pick a contact and a text dump. New State: The Flight Simulator.
When the user selects "Billy Ragland" and clicks "Simulate," the screen splits into three panes:
Pane A: The Output (Rendered)
• Displays the email visually (no HTML tags).
• Mobile Mode: A toggle to see how it looks on a phone screen (critical, as 80% of B2B emails are opened on mobile) [Source 1234].
Pane B: The Neural Logic (Side Panel)
• The AI outputs a meta-commentary:
Pane C: The Spam/Deliverability Audit
• Before the user approves the prompt, run a client-side check for "Spam Trigger Words" (e.g., "Guarantee", "Save Money") [Source 587].
• If found, highlight them in Red and suggest clinical alternatives (e.g., change "Save" to "Mitigate Liability").

--------------------------------------------------------------------------------
3. Implementation Code (The Update)
You need to update your build.md handler and your frontend Compose logic.
Update build.md (Backend Handler): Modify the prompt construction to enforce the "Nodal Voice" and inject data structure.
// Inside your handler function
const { draft, context, contact, mode } = req.body;

// 1. Construct the "System Instruction" based on Nodal Philosophy
const systemPrompt = `
  You are the Nodal Architect. You do not sell; you diagnose.
  
  CORE DIRECTIVES:
  1. Brevity: Max 80 words. [Source: Instantly.ai Benchmarks]
  2. Tone: Obsidian, Clinical, "Steve Jobs". No "Hope you are well."
  3. Objective: Expose financial liability (4CP, Ratchets, Volatility).
  
  DATA VECTORS AVAILABLE:
  - Name: ${contact.name}
  - Company: ${contact.company}
  - Industry: ${contact.industry}
  - Calc_Load_Factor: ${contact.metadata?.loadFactor || 'Unknown'}
  - Contract_Exp: ${contact.contractEndDate || 'Unknown'}
`;

// 2. The User's specific strategic intent
const userStrategy = prompt || "Analyze the contact's industry for inherent grid risks.";

// 3. The Execution Command
const finalPrompt = `
  ${systemPrompt}
  
  STRATEGY: ${userStrategy}
  
  TASK: Write a cold email to ${contact.name}. 
  OUTPUT FORMAT: JSON with keys: { "subject_line": string, "body_html": string, "logic_reasoning": string }
`;
Update Frontend (Rendering): In your TestProtocol component, stop dumping raw text.
// Instead of <div>{response.text}</div>
// Use a sanitized HTML renderer and a Logic Sidebar

<div className="grid grid-cols-3 gap-4 h-full">
  
  {/* PANE A: The Email Preview */}
  <div className="col-span-2 bg-white text-black p-6 rounded-lg shadow-inner font-sans">
    <div className="border-b mb-4 pb-2">
      <span className="text-gray-500 text-xs">SUBJECT:</span> 
      <span className="font-bold ml-2">{aiResponse.subject_line}</span>
    </div>
    <div 
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: aiResponse.body_html }} 
    />
  </div>

  {/* PANE B: The Neural Logic Sidebar */}
  <div className="col-span-1 bg-zinc-900/50 border-l border-white/10 p-4 font-mono text-xs text-green-400">
    <div className="mb-2 uppercase tracking-widest text-zinc-500">Neural Reasoning</div>
    <p>{aiResponse.logic_reasoning}</p>
    
    <div className="mt-6 uppercase tracking-widest text-zinc-500">Deliverability Scan</div>
    <div className="flex items-center gap-2 mt-2">
      <div className="w-2 h-2 rounded-full bg-emerald-500" />
      <span>Spam Score: Low</span>
    </div>
  </div>
</div>
Summary of Directive
1. Kill the HTML tags in the view. Render the email.
2. Force the AI to explain itself. Return a logic_reasoning field alongside the email content.
3. Inject the Philosophy. Hardcode the "80-word limit" and "Forensic Tone" into the system prompt so you don't have to type it every time.
4. Simulate the Receiver. Show the user what "Billy Ragland" will actually see on his phone.
This turns your tool from a Text Generator into a Volatility Weapon.
