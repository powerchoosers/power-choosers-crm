import { Html, Body, Container, Text, Section, Head, Preview, Hr, Link } from "@react-email/components";
import * as React from 'react';

interface AdminIntelligenceProps {
    person: {
        fullName: string;
        firstName: string;
        lastName: string;
        title: string;
        email: string;
        phone?: string;
        linkedin?: string;
        location?: string;
    };
    company: {
        name: string;
        domain: string;
        revenue?: string;
        employees?: string;
        industry?: string;
    };
    analysis: {
        id: string;
        provider: string;
        rate: string;
        usage: string;
        grade: string;
    };
    crmLink: string;
    analysisLink: string;
}

export default function AdminIntelligence({ person, company, analysis, crmLink, analysisLink }: AdminIntelligenceProps) {
    return (
        <Html>
            <Head />
            <Preview>[NEW_INTEL] {company.name} // {person.fullName}</Preview>
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

                    <Text style={headerLabel}>
                        ● NEW_INTEL_ACQUIRED
                    </Text>
                    <Text style={mainHeading}>
                        Target Intelligence Packet
                    </Text>

                    {/* Identity Block */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// IDENTITY_VECTOR (APOLLO_ENRICHED)</Text>

                        <div style={dataRow}>
                            <Text style={label}>NAME:</Text>
                            <Text style={value}>{person.fullName}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>ROLE:</Text>
                            <Text style={value}>{person.title}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>COMPANY:</Text>
                            <Text style={value}>{company.name} ({company.domain})</Text>
                        </div>
                        {company.revenue && (
                            <div style={dataRow}>
                                <Text style={label}>REVENUE:</Text>
                                <Text style={value}>{company.revenue}</Text>
                            </div>
                        )}
                        {company.employees && (
                            <div style={dataRow}>
                                <Text style={label}>EMPLOYEES:</Text>
                                <Text style={value}>{company.employees}</Text>
                            </div>
                        )}
                        <div style={dataRow}>
                            <Text style={label}>LOCATION:</Text>
                            <Text style={value}>{person.location || 'Unknown'}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>CONTACT:</Text>
                            <Text style={value}>{person.email} {person.phone ? `/ ${person.phone}` : ''}</Text>
                        </div>
                        {person.linkedin && (
                            <div style={dataRow}>
                                <Text style={label}>SOCIAL:</Text>
                                <Link href={person.linkedin} style={link}>LinkedIn Profile</Link>
                            </div>
                        )}
                    </Section>

                    {/* Forensic Block */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// FORENSIC_OUTPUT (BILL_ANALYSIS)</Text>

                        <div style={dataRow}>
                            <Text style={label}>PROVIDER:</Text>
                            <Text style={value}>{analysis.provider}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>RATE:</Text>
                            <Text style={value}>{analysis.rate} ¢/kWh</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>ANNUAL_USAGE:</Text>
                            <Text style={value}>{analysis.usage} kWh</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>HEALTH_GRADE:</Text>
                            <Text style={{ ...value, color: analysis.grade.includes('A') ? "#00CC88" : "#FF4444" }}>{analysis.grade}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>ANALYSIS_ID:</Text>
                            <Text style={{ ...value, fontSize: '10px' }}>{analysis.id}</Text>
                        </div>
                    </Section>

                    {/* Strategic Action */}
                    <Section style={actionSection}>
                        <Text style={label}>STRATEGIC_UPLINKS:</Text>
                        <div style={{ marginTop: '10px' }}>
                            <Link href={crmLink} style={actionLink}>→ OPEN_CRM_DOSSIER</Link>
                            <br />
                            <Link href={analysisLink} style={actionLink}>→ VIEW_ANALYSIS_DETAILS</Link>
                        </div>
                    </Section>

                    <Text style={footer}>
                        NODAL_POINT // INTERNAL_EYES_ONLY
                    </Text>

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
    fontSize: "24px",
    fontWeight: "bold",
    margin: "10px 0 30px",
    fontFamily: "Helvetica, sans-serif",
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
};

const dataRow = {
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: '8px',
};

const label = {
    color: "#666",
    fontSize: "10px",
    fontWeight: "bold",
    width: "120px",
    margin: '0',
};

const value = {
    color: "#eee",
    fontSize: "12px",
    margin: '0',
};

const link = {
    color: "#002FA7",
    fontSize: "12px",
    textDecoration: "underline",
};

const actionSection = {
    margin: '30px 0',
};

const actionLink = {
    color: "#00CC88",
    fontSize: "14px",
    textDecoration: "none",
    fontWeight: "bold",
    display: 'block',
    marginBottom: '10px',
};

const footer = {
    color: "#222",
    fontSize: "9px",
    marginTop: "60px",
    textAlign: 'center' as const,
    letterSpacing: "2px",
};
