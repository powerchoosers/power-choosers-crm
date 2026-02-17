import { Html, Body, Container, Text, Section, Head, Preview, Hr, Link } from "@react-email/components";
import * as React from 'react';

interface BookingConfirmationProps {
    contactName: string;
    companyName: string;
    date: string;
    time: string;
    meetingLink?: string;
}

export default function BookingConfirmation({
    contactName,
    companyName,
    date,
    time,
    meetingLink
}: BookingConfirmationProps) {
    return (
        <Html>
            <Head />
            <Preview>Forensic Briefing Confirmed: {date} @ {time}</Preview>
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
                                NODAL_POINT <span style={{ color: "#444" }}>//</span> <span style={{ color: "#002FA7" }}>FORENSICS</span>
                            </Text>
                        </div>
                    </Section>

                    <Text style={headerLabel}>
                        ● PROTOCOL_ESTABLISHED
                    </Text>
                    <Text style={mainHeading}>
                        Briefing Secured.
                    </Text>

                    {/* Body */}
                    <Text style={bodyText}>
                        {contactName},<br /><br />
                        Your forensic briefing has been secured. Our intelligence unit will contact you at the designated time window to review your energy infrastructure analysis.
                    </Text>

                    {/* Data Card */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// BRIEFING_VECTOR</Text>

                        <div style={gridContainer}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>VECTOR_TARGET</Text>
                                <Text style={{ color: "#fff", fontSize: "16px", fontWeight: "bold", margin: "5px 0 0", fontFamily: "monospace" }}>{companyName}</Text>
                            </div>
                        </div>

                        <Hr style={hr} />

                        <div style={gridContainer}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>TIME_WINDOW</Text>
                                <Text style={{ color: "#00CC88", fontSize: "20px", fontWeight: "bold", margin: "5px 0 0", fontFamily: "monospace" }}>{date}</Text>
                                <Text style={{ color: "#00CC88", fontSize: "16px", fontWeight: "normal", margin: "2px 0 0", fontFamily: "monospace" }}>@ {time}</Text>
                            </div>
                        </div>

                    </Section>

                    <Text style={extraContext}>
                        Please have your recent utility invoices available for cross-verification during the briefing.
                    </Text>

                    {meetingLink && (
                        <Section style={{ textAlign: 'center', marginTop: '40px' }}>
                            <Link href={meetingLink} style={link}>
                                Access Secure Room (If Applicable)
                            </Link>
                        </Section>
                    )}

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
    marginBottom: "15px",
};

const gridItem = {
    marginBottom: "10px",
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
    margin: "20px 0 20px",
};

const extraContext = {
    color: "#666",
    fontSize: "13px",
    lineHeight: "1.5",
    fontStyle: "italic",
    marginTop: "20px",
};

const footer = {
    color: "#444",
    fontSize: "11px",
    fontFamily: "monospace",
    marginTop: "60px",
    textAlign: 'center' as const,
    letterSpacing: "1px",
};

const link = {
    color: "#002FA7",
    fontSize: "14px",
    textDecoration: "underline",
};
