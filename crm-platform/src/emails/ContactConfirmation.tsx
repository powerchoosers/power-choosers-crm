import { Html, Body, Container, Text, Section, Head, Preview, Hr, Link } from "@react-email/components";
import * as React from 'react';

interface ContactConfirmationProps {
  name: string;
}

export default function ContactConfirmation({ name }: ContactConfirmationProps) {
  const firstName = name.split(' ')[0];

  return (
    <Html>
      <Head />
      <Preview>Signal received. We'll be in touch shortly — Nodal Point</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={{ marginBottom: "24px" }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img
                src="https://nodalpoint.io/images/nodalpoint-webicon.png"
                alt="Nodal Point"
                style={{ width: "32px", height: "32px", display: "block", marginRight: "12px" }}
              />
              <Text style={{ fontSize: "16px", fontWeight: "bold", fontFamily: "monospace", margin: 0, letterSpacing: "-0.5px", color: "#ffffff" }}>
                NODAL_POINT <span style={{ color: "#444" }}>//</span> <span style={{ color: "#002FA7" }}>ADVISORY</span>
              </Text>
            </div>
          </Section>

          <Text style={headerLabel}>● SIGNAL_RECEIVED</Text>
          <Text style={mainHeading}>We got your message.</Text>

          <Text style={bodyText}>
            {firstName},<br /><br />
            Your inquiry has been logged. A member of the Nodal Point team will review it and follow up within one business day.
          </Text>

          {/* What Happens Next Card */}
          <Section style={dataCard}>
            <Text style={cardLabel}>// WHAT_HAPPENS_NEXT</Text>

            <div style={stepRow}>
              <Text style={stepNumber}>01</Text>
              <Text style={stepText}>We review your message and research your energy footprint.</Text>
            </div>
            <Hr style={hr} />
            <div style={stepRow}>
              <Text style={stepNumber}>02</Text>
              <Text style={stepText}>A Nodal Point engineer reaches out directly — no call center, no scripts.</Text>
            </div>
            <Hr style={hr} />
            <div style={stepRow}>
              <Text style={stepNumber}>03</Text>
              <Text style={stepText}>If there's a fit, we schedule a forensic briefing and show you the numbers.</Text>
            </div>
          </Section>

          <Text style={extraContext}>
            In the meantime, you can explore our{' '}
            <Link href="https://nodalpoint.io/bill-debugger" style={link}>Bill Debugger</Link>{' '}
            or review{' '}
            <Link href="https://nodalpoint.io/market-data" style={link}>live ERCOT market data</Link>.
          </Text>

          <Text style={footer}>
            Nodal Point // Forensic Energy Intelligence<br />
            Fort Worth, TX · nodalpoint.io
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#000",
  fontFamily: 'Helvetica, Arial, sans-serif',
  margin: "0",
};

const container = {
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "600px",
};

const headerLabel = {
  color: "#002FA7",
  fontSize: "10px",
  fontFamily: "monospace",
  letterSpacing: "2px",
  fontWeight: "bold",
};

const mainHeading = {
  color: "#fff",
  fontSize: "32px",
  fontWeight: "bold",
  margin: "10px 0 30px",
  letterSpacing: "-1px",
};

const bodyText = {
  color: "#ccc",
  fontSize: "16px",
  lineHeight: "1.6",
};

const dataCard = {
  backgroundColor: "#0a0a0a",
  border: "1px solid #1a1a1a",
  borderRadius: "12px",
  padding: "24px",
  margin: "30px 0",
};

const cardLabel = {
  color: "#444",
  fontSize: "10px",
  fontFamily: "monospace",
  margin: "0 0 20px",
  letterSpacing: "1px",
};

const stepRow = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '16px',
  padding: '12px 0',
};

const stepNumber = {
  color: "#002FA7",
  fontSize: "11px",
  fontWeight: "bold",
  fontFamily: "monospace",
  margin: "0",
  minWidth: "24px",
};

const stepText = {
  color: "#aaa",
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "0",
  flex: 1,
};

const hr = {
  borderColor: "#1a1a1a",
  margin: "0",
};

const extraContext = {
  color: "#555",
  fontSize: "13px",
  lineHeight: "1.6",
  marginTop: "24px",
};

const link = {
  color: "#002FA7",
  textDecoration: "underline",
};

const footer = {
  color: "#444",
  fontSize: "11px",
  fontFamily: "monospace",
  marginTop: "60px",
  textAlign: 'center' as const,
  letterSpacing: "1px",
};
