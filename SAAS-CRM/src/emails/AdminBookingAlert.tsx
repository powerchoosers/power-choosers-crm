import { Html, Body, Container, Text, Section, Head, Preview, Hr, Link } from "@react-email/components";
import * as React from 'react';

interface AdminBookingAlertProps {
    contactName: string;
    companyName: string;
    email: string;
    phone: string;
    date: string;
    time: string;
    source: string;
    notes?: string;
    taskId?: string;
}

export default function AdminBookingAlert({
    contactName,
    companyName,
    email,
    phone,
    date,
    time,
    source,
    notes,
    taskId
}: AdminBookingAlertProps) {
    const isForensic = source === 'forensic-briefing';

    return (
        <Html>
            <Head />
            <Preview>{isForensic ? 'FORENSIC BRIEFING' : 'NEW LEAD'}: {companyName} // {contactName}</Preview>
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
                        ● {isForensic ? 'FORENSIC_BRIEFING_SCHEDULED' : 'NEW_LEAD_DETECTED'}
                    </Text>
                    <Text style={mainHeading}>
                        {isForensic ? 'Briefing Protocol Active' : 'New Intake Received'}
                    </Text>

                    {/* Data Card */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// DOSSIER_DETAILS</Text>

                        <div style={dataRow}>
                            <Text style={label}>CONTACT:</Text>
                            <Text style={value}>{contactName}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>COMPANY:</Text>
                            <Text style={value}>{companyName}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>EMAIL:</Text>
                            <Text style={value}>{email}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>PHONE:</Text>
                            <Text style={value}>{phone || 'N/A'}</Text>
                        </div>

                        <Hr style={hr} />

                        <div style={dataRow}>
                            <Text style={label}>DATE:</Text>
                            <Text style={{ ...value, color: "#00CC88" }}>{date || 'Pending'}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>TIME:</Text>
                            <Text style={{ ...value, color: "#00CC88" }}>{time || 'Pending'}</Text>
                        </div>
                        <div style={dataRow}>
                            <Text style={label}>SOURCE:</Text>
                            <Text style={value}>{source.toUpperCase()}</Text>
                        </div>
                        {taskId && (
                            <div style={dataRow}>
                                <Text style={label}>TASK_ID:</Text>
                                <Text style={{ ...value, fontSize: '10px' }}>{taskId}</Text>
                            </div>
                        )}
                    </Section>

                    {notes && (
                        <Section style={dataCard}>
                            <Text style={cardLabel}>// ADDITIONAL_NOTES</Text>
                            <Text style={value}>{notes}</Text>
                        </Section>
                    )}

                    <Text style={footer}>
                        NODAL_POINT // INTERNAL_SYSTEMS_ONLY
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
    width: "100px",
    margin: '0',
};

const value = {
    color: "#eee",
    fontSize: "12px",
    margin: '0',
    flex: 1,
};

const hr = {
    borderColor: "#1a1a1a",
    margin: "15px 0",
};

const footer = {
    color: "#222",
    fontSize: "9px",
    marginTop: "60px",
    textAlign: 'center' as const,
    letterSpacing: "2px",
};
