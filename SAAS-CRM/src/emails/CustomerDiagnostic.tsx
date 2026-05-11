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
        provider: string;
        rate: string;
        usage: string;
        term: string;
    };
    reportLink: string;
}

export default function CustomerDiagnostic({ name, company, stats, reportLink }: CustomerDiagnosticProps) {
    return (
        <Html>
            <Head />
            <Preview>Bill review ready: {company}</Preview>
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
                                NODAL POINT <span style={{ color: "#444" }}>//</span> <span style={{ color: "#002FA7" }}>FORENSICS</span>
                            </Text>
                        </div>
                    </Section>

                    <Text style={headerLabel}>
                        ● REVIEW_READY
                    </Text>
                    <Text style={mainHeading}>
                        Your bill review is ready.
                    </Text>

                    {/* Body */}
                    <Text style={bodyText}>
                        {name},<br /><br />
                        We reviewed the bill for <strong style={{ color: "#fff" }}>{company}</strong> and pulled out the main cost drivers.
                    </Text>

                    <Text style={bodyText}>
                        Based on the bill data, your facility in {stats.location.split(',')[0]} received an initial rating of <strong>{stats.grade}</strong>.
                    </Text>

                    {/* Data Card */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// REVIEW_SUMMARY</Text>

                        <div style={gridContainer}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>REVIEW_GRADE</Text>
                                <Text style={{
                                    color: stats.grade.includes('A') ? "#00CC88" : stats.grade.includes('B') ? "#FFCC00" : "#FF4444",
                                    fontSize: "20px",
                                    fontWeight: "bold",
                                    margin: "5px 0 0",
                                    fontFamily: "monospace"
                                }}>{stats.grade}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>ESTIMATED_VARIANCE</Text>
                                <Text style={{ color: "#00CC88", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0", fontFamily: "monospace" }}>{stats.savings}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>RISK_LEVEL</Text>
                                <Text style={{ color: stats.risk === 'HIGH' ? "#FF4444" : "#fff", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0", fontFamily: "monospace" }}>{stats.risk}</Text>
                            </div>
                        </div>

                        <Hr style={hr} />

                        <Text style={{ color: "#666", fontSize: "11px", fontFamily: "monospace", marginTop: "10px" }}>
                            VECTOR: {stats.location} // ZONE: {stats.zone}
                        </Text>
                    </Section>

                    {/* Extended Metrics */}
                    <Section style={{ margin: "0 0 30px" }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1a1a1a', paddingTop: '20px' }}>
                            <div style={{ width: '48%' }}>
                                <Text style={smallLabel}>CURRENT PROVIDER</Text>
                                <Text style={smallValue}>{stats.provider}</Text>
                            </div>
                            <div style={{ width: '48%' }}>
                                <Text style={smallLabel}>DETECTED RATE</Text>
                                <Text style={smallValue}>{stats.rate} ¢/kWh</Text>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
                            <div style={{ width: '48%' }}>
                                <Text style={smallLabel}>ANNUAL USAGE</Text>
                                <Text style={smallValue}>{stats.usage} kWh</Text>
                            </div>
                            <div style={{ width: '48%' }}>
                                <Text style={smallLabel}>CONTRACT STATUS</Text>
                                <Text style={smallValue}>{stats.term}</Text>
                            </div>
                        </div>
                    </Section>

                    {/* Enrichment Context */}
                    <Text style={extraContext}>
                        We also noted that your facility in {stats.location.split(',')[0]} is in a zone with tighter reserve capacity right now.
                    </Text>

                    <Section style={{ textAlign: 'center', marginTop: '40px' }}>
                        <Button
                            href={reportLink}
                            style={button}
                        >
                            Book a review
                        </Button>
                    </Section>

                    <Text style={footer}>
                        Nodal Point // Energy review<br />
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

const smallLabel = {
    color: "#666",
    fontSize: "9px",
    fontFamily: "monospace",
    letterSpacing: "1px",
    margin: "0 0 4px",
    textTransform: 'uppercase' as const,
};

const smallValue = {
    color: "#eee",
    fontSize: "14px",
    fontWeight: "bold",
    margin: "0",
    fontFamily: "sans-serif",
};
