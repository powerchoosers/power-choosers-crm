Nodal Point Communication ArchitectureVersion: 2.1 (Signal/Forensic)Sender Identity: Lewis Patterson signal@nodalpoint.ioDesign System: Dark Mode (Obsidian), Monospace Data, Klein Blue Accents.1. Visual Standards (Email Clients)Standard emails are white and cluttered. Nodal emails must feel like a "Terminal Transmission."ElementStyle SpecificationCanvas#000000 (True Black)ContainerMax-width 600px, Center aligned, #111111 Background optional for cards.TypographyHeadlines: Helvetica/Arial (Bold). Data/Labels: Courier New/Monospace.Accents#002FA7 (Klein Blue) for signals/links. #FF4444 for Risk. #00CC88 for Opportunity.ToneMinimalist. No fluff. High-status. "We do not sell; we diagnose."2. The Four Vectors (Templates)A. Customer Diagnostic (Trigger: Analysis Complete)Subject: Signal Detected: [Company Name] // Forensic SnapshotGoal: Deliver immediate value, prove competence, and invite the next step (Booking or Reply).Content Structure:Header: ● SIGNAL_DETECTED // [TIMESTAMP] (Monospace, Blue)Greeting: Simple "Lewis here." or just "[First Name],"The Hook: "Our forensic engine processed the energy profile for [Company]. We detected structural inefficiencies exposing your ledger to volatility."The Evidence (Glass Card):HEALTH_GRADE: [C-] (Color coded)EST_VARIANCE: [$12,400] (Green)RISK_PROFILE: [UNHEDGED] (Red)The Enrichment Hook: "We also noted your facility in [City] operates in a [Load Zone] currently experiencing reserve capacity tightness."Call to Action:Primary Button: [ ACCESS FULL REPORT ] (Links to Bill Debugger Result)Secondary Text: "Or reply to this transmission to initiate a live briefing."B. Admin Intelligence Packet (Trigger: Analysis Complete)Subject: [NEW_INTEL] [Company] // [First Name] [Last Name]Goal: Give Lewis the raw data immediately to prep for a sniper follow-up.Content Structure:Header: /// NEW_NODE_INGESTED (Monospace, Blue)Identity Block (Enriched via Apollo):Name: [Full Name]Role: [Title] (e.g., CFO, Facilities Director)Company: [Company Name]Revenue: [Est. Revenue]Employees: [Count]Location: [City, State]Contact: [Email] / [Phone]Forensic Output (Bill Analysis):Provider: [Current Provider] (e.g., TXU)Rate: [$/kWh]Usage: [Annual kWh]Analysis ID: [UUID]Strategic Notes:"High probability of 4CP exposure based on load factor.""Contract expires in [Month/Year]."C. Customer Booking Confirmation (Trigger: Meeting Scheduled)Subject: Protocol Initiated: Strategy Session // [Date]Goal: Confirm the time and set the "Forensic" tone. Do not say "Thanks for chatting!"Content Structure:Header: PROTOCOL_INITIATED (Monospace, Green)The Message: "Your strategic review has been locked into the grid. We are conducting a preliminary audit of your public energy data prior to the call to maximize bandwidth."The Agenda (Glass Card):TIME_WINDOW: [Date] @ [Time] CSTLINK: [Zoom/Google Meet URL]OBJECTIVE: Variance Analysis & Risk Mitigation.Preparation Protocol: "Please have your most recent 12 months of utility invoices accessible for the deep dive."Footer: "Nodal Point // Signal Over Noise"D. Admin Tactical Alert (Trigger: Meeting Scheduled)Subject: 📅 CALENDAR_LOCK: [Company] // [Date]Goal: Confirm the booking internally and link back to the dossier.Content Structure:Header: TACTICAL_AGENDA_UPDATE (Monospace, Blue)Session Details:Target: [Name] ([Title])Entity: [Company]Time: [Date] @ [Time] CSTDossier Uplink:Link to CRM Profile: https://nodalpoint.io/network/people/[ID]Link to Analysis: https://nodalpoint.io/bill-debugger/[ID]Quick Stats:"This lead has viewed the '4CP Guide' twice.""Apollo Match: High Intent."3. Implementation Code (React Email)Use this code structure to build the emails.Example: Customer Diagnostic Email (src/emails/CustomerDiagnostic.tsx)import { Html, Body, Container, Text, Section, Button, Hr } from "@react-email/components";

export default function CustomerDiagnostic({ name, company, stats }: any) {
  return (
    <Html>
      <Body style={{ backgroundColor: "#000", fontFamily: "Helvetica, sans-serif", margin: "0" }}>
        <Container style={{ margin: "0 auto", padding: "40px 20px", maxWidth: "600px" }}>
          
          {/* Header */}
          <Text style={{ color: "#002FA7", fontSize: "10px", fontFamily: "monospace", letterSpacing: "2px" }}>
            ● SIGNAL_DETECTED
          </Text>
          <Text style={{ color: "#fff", fontSize: "24px", fontWeight: "bold", margin: "10px 0 20px" }}>
            Analysis Complete.
          </Text>

          {/* Body */}
          <Text style={{ color: "#ccc", fontSize: "16px", lineHeight: "1.5" }}>
            {name},<br/><br/>
            Our forensic engine has processed the energy profile for <strong style={{color:"#fff"}}>{company}</strong>. We detected structural inefficiencies exposing your ledger to unnecessary volatility.
          </Text>

          {/* Data Card */}
          <Section style={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: "8px", padding: "20px", margin: "30px 0" }}>
            <Text style={{ color: "#666", fontSize: "10px", fontFamily: "monospace", margin: "0 0 15px" }}>// DIAGNOSTIC_OUTPUT</Text>
            
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <Text style={{ color: "#888", fontSize: "10px", fontWeight: "bold" }}>HEALTH_GRADE</Text>
                <Text style={{ color: "#FF4444", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0" }}>{stats.grade}</Text>
              </div>
              <div>
                <Text style={{ color: "#888", fontSize: "10px", fontWeight: "bold" }}>EST_VARIANCE</Text>
                <Text style={{ color: "#00CC88", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0" }}>{stats.savings}</Text>
              </div>
              <div>
                <Text style={{ color: "#888", fontSize: "10px", fontWeight: "bold" }}>RISK</Text>
                <Text style={{ color: "#fff", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0" }}>HIGH</Text>
              </div>
            </div>
          </Section>

          {/* CTA */}
          <Button 
            href="[https://nodalpoint.io/report](https://nodalpoint.io/report)"
            style={{ backgroundColor: "#fff", color: "#000", padding: "12px 24px", borderRadius: "4px", fontWeight: "bold", textDecoration: "none", fontSize: "14px" }}
          >
            Access Forensic Report
          </Button>

          <Text style={{ color: "#666", fontSize: "12px", marginTop: "30px" }}>
            Nodal Point // Signal Over Noise<br/>
            Fort Worth, TX
          </Text>

        </Container>
      </Body>
    </Html>
  );
}
