import { Html, Body, Container, Text, Section, Head, Preview, Hr, Link } from "@react-email/components";
import * as React from 'react';

interface ApolloEnrichment {
  jobTitle?: string;
  companyName?: string;
  linkedin?: string;
  location?: string;
  seniority?: string;
  industry?: string;
  phone?: string;
}

interface ContactAdminAlertProps {
  name: string;
  company?: string;
  email: string;
  message: string;
  enrichment?: ApolloEnrichment;
}

export default function ContactAdminAlert({ name, company, email, message, enrichment }: ContactAdminAlertProps) {
  const hasEnrichment = enrichment && Object.values(enrichment).some(Boolean);

  return (
    <Html>
      <Head />
      <Preview>CONTACT_RECEIVED: {name}{company ? ` — ${company}` : ''}</Preview>
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
                NODAL_POINT <span style={{ color: "#444" }}>//</span> <span style={{ color: "#002FA7" }}>INTELLIGENCE</span>
              </Text>
            </div>
          </Section>

          <Text style={headerLabel}>● CONTACT_FORM_RECEIVED</Text>
          <Text style={mainHeading}>New Inquiry Detected.</Text>

          {/* Sender Dossier */}
          <Section style={dataCard}>
            <Text style={cardLabel}>// SENDER_DOSSIER</Text>

            <div style={dataRow}>
              <Text style={labelStyle}>CONTACT:</Text>
              <Text style={value}>{name}</Text>
            </div>
            {company && (
              <div style={dataRow}>
                <Text style={labelStyle}>COMPANY:</Text>
                <Text style={value}>{company}</Text>
              </div>
            )}
            <div style={dataRow}>
              <Text style={labelStyle}>EMAIL:</Text>
              <Text style={{ ...value, color: "#4169E1" }}>
                <Link href={`mailto:${email}`} style={{ color: "#4169E1", textDecoration: "none" }}>{email}</Link>
              </Text>
            </div>
          </Section>

          {/* Apollo Enrichment */}
          {hasEnrichment && (
            <Section style={{ ...dataCard, borderColor: "#002FA7" }}>
              <Text style={{ ...cardLabel, color: "#002FA7" }}>// APOLLO_ENRICHMENT</Text>

              {enrichment?.jobTitle && (
                <div style={dataRow}>
                  <Text style={labelStyle}>TITLE:</Text>
                  <Text style={value}>{enrichment.jobTitle}</Text>
                </div>
              )}
              {enrichment?.companyName && enrichment.companyName !== company && (
                <div style={dataRow}>
                  <Text style={labelStyle}>EMPLOYER:</Text>
                  <Text style={value}>{enrichment.companyName}</Text>
                </div>
              )}
              {enrichment?.seniority && (
                <div style={dataRow}>
                  <Text style={labelStyle}>SENIORITY:</Text>
                  <Text style={{ ...value, color: "#00CC88" }}>{enrichment.seniority.toUpperCase()}</Text>
                </div>
              )}
              {enrichment?.industry && (
                <div style={dataRow}>
                  <Text style={labelStyle}>INDUSTRY:</Text>
                  <Text style={value}>{enrichment.industry}</Text>
                </div>
              )}
              {enrichment?.location && (
                <div style={dataRow}>
                  <Text style={labelStyle}>LOCATION:</Text>
                  <Text style={value}>{enrichment.location}</Text>
                </div>
              )}
              {enrichment?.phone && (
                <div style={dataRow}>
                  <Text style={labelStyle}>PHONE:</Text>
                  <Text style={value}>{enrichment.phone}</Text>
                </div>
              )}
              {enrichment?.linkedin && (
                <div style={dataRow}>
                  <Text style={labelStyle}>LINKEDIN:</Text>
                  <Text style={value}>
                    <Link href={enrichment.linkedin} style={{ color: "#4169E1", textDecoration: "none" }}>
                      {enrichment.linkedin.replace('https://www.linkedin.com/in/', 'li/')}
                    </Link>
                  </Text>
                </div>
              )}
            </Section>
          )}

          {/* Message */}
          <Section style={dataCard}>
            <Text style={cardLabel}>// MESSAGE_PAYLOAD</Text>
            <Text style={messageText}>{message}</Text>
          </Section>

          <Text style={footer}>NODAL_POINT // INTERNAL_SYSTEMS_ONLY</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#000",
  fontFamily: 'monospace',
  margin: "0",
};

const container = {
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "600px",
};

const headerLabel = {
  color: "#002FA7",
  fontSize: "12px",
  letterSpacing: "2px",
  fontWeight: "bold",
  fontFamily: "monospace",
};

const mainHeading = {
  color: "#fff",
  fontSize: "28px",
  fontWeight: "bold",
  margin: "10px 0 30px",
  fontFamily: "Helvetica, sans-serif",
  letterSpacing: "-0.5px",
};

const dataCard = {
  backgroundColor: "#0a0a0a",
  border: "1px solid #1a1a1a",
  borderRadius: "8px",
  padding: "20px",
  margin: "20px 0",
};

const cardLabel = {
  color: "#444",
  fontSize: "10px",
  margin: "0 0 15px",
  fontFamily: "monospace",
  letterSpacing: "1px",
};

const dataRow = {
  display: 'flex',
  justifyContent: 'flex-start',
  marginBottom: '8px',
};

const labelStyle = {
  color: "#666",
  fontSize: "10px",
  fontWeight: "bold",
  width: "100px",
  margin: '0',
  fontFamily: "monospace",
};

const value = {
  color: "#eee",
  fontSize: "12px",
  margin: '0',
  flex: 1,
  fontFamily: "monospace",
};

const messageText = {
  color: "#ccc",
  fontSize: "13px",
  lineHeight: "1.7",
  margin: "0",
  whiteSpace: "pre-wrap" as const,
  fontFamily: "monospace",
};

const footer = {
  color: "#222",
  fontSize: "9px",
  marginTop: "60px",
  textAlign: 'center' as const,
  letterSpacing: "2px",
  fontFamily: "monospace",
};
