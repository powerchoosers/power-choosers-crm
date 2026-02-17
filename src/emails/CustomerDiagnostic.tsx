import { Html, Body, Container, Text, Section, Button, Head, Preview, Hr } from "@react-email/components";
import * as React from 'react';

interface CustomerDiagnosticProps {
    name: string;
    company: string;
    stats: {
        grade: string;
        savings: string;
        risk: string;
        location: string;
        zone: string;
    };
    reportLink: string;
}

export default function CustomerDiagnostic({ name, company, stats, reportLink }: CustomerDiagnosticProps) {
    return (
        <Html>
            <Head />
            <Preview>Signal Detected: {company} // Forensic Snapshot</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={{ marginBottom: "24px" }}>
                        <div style={{ backgroundColor: "#ffffff", display: "inline-block", padding: "8px 12px", borderRadius: "4px" }}>
                            <img
                                src="https://nodalpoint.io/images/nodalpoint.png"
                                alt="Nodal Point"
                                style={{ height: "20px", width: "auto", display: "block" }}
                            />
                        </div>
                    </Section>

                    <Text style={headerLabel}>
                        ● SIGNAL_DETECTED
                    </Text>
                    <Text style={mainHeading}>
                        Analysis Complete.
                    </Text>

                    {/* Body */}
                    <Text style={bodyText}>
                        {name},<br /><br />
                        Our forensic engine has processed the energy profile for <strong style={{ color: "#fff" }}>{company}</strong>. We detected structural inefficiencies exposing your ledger to unnecessary volatility.
                    </Text>

                    <Text style={bodyText}>
                        Based on the data extracted from your utility bills, your facility in {stats.location.split(',')[0]} is currently graded as a <strong>{stats.grade}</strong> risk.
                    </Text>

                    {/* Data Card */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// DIAGNOSTIC_OUTPUT</Text>

                        <div style={gridContainer}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>HEALTH_GRADE</Text>
                                <Text style={{
                                    color: stats.grade.includes('A') ? "#00CC88" : stats.grade.includes('B') ? "#FFCC00" : "#FF4444",
                                    fontSize: "20px",
                                    fontWeight: "bold",
                                    margin: "5px 0 0",
                                    fontFamily: "monospace"
                                }}>{stats.grade}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>EST_VARIANCE</Text>
                                <Text style={{ color: "#00CC88", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0", fontFamily: "monospace" }}>{stats.savings}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>RISK</Text>
                                <Text style={{ color: stats.risk === 'HIGH' ? "#FF4444" : "#fff", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0", fontFamily: "monospace" }}>{stats.risk}</Text>
                            </div>
                        </div>

                        <Hr style={hr} />

                        <Text style={{ color: "#666", fontSize: "11px", fontFamily: "monospace", marginTop: "10px" }}>
                            VECTOR: {stats.location} // ZONE: {stats.zone}
                        </Text>
                    </Section>

                    {/* Enrichment Context */}
                    <Text style={extraContext}>
                        We also noted your facility in {stats.location.split(',')[0]} operates in a {stats.zone} current experiencing reserve capacity tightness.
                    </Text>

                    <Section style={{ textAlign: 'center', marginTop: '40px' }}>
                        <Button
                            href={reportLink}
                            style={button}
                        >
                            Schedule Forensic Briefing
                        </Button>
                    </Section>

                    <Text style={footer}>
                        Nodal Point // Signal Over Noise<br />
                        Fort Worth, TX
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

const gridContainer = {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "15px",
};

const gridItem = {
    flex: 1,
};

const itemLabel = {
    color: "#888",
    fontSize: "10px",
    fontWeight: "bold",
    fontFamily: "monospace",
    letterSpacing: "1px",
};

const hr = {
    borderColor: "#1a1a1a",
    margin: "20px 0 10px",
};

const extraContext = {
    color: "#888",
    fontSize: "14px",
    lineHeight: "1.5",
    fontStyle: "italic",
};

const button = {
    backgroundColor: "#fff",
    color: "#000",
    padding: "16px 32px",
    borderRadius: "8px",
    fontWeight: "bold",
    textDecoration: "none",
    fontSize: "16px",
    display: "inline-block",
};

const footer = {
    color: "#444",
    fontSize: "11px",
    fontFamily: "monospace",
    marginTop: "60px",
    textAlign: 'center' as const,
    letterSpacing: "1px",
};
