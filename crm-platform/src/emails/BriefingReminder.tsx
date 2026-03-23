import { Html, Body, Container, Text, Section, Head, Preview, Hr, Link, Img } from "@react-email/components";
import * as React from 'react';

interface BriefingReminderProps {
    contactName: string;
    companyName: string;
    appointmentDate: string;
    appointmentTime: string;
    taskType: string;
    meetingUrl?: string;
    sender: {
        name: string;
        title: string;
        phone: string;
        email: string;
        city: string;
        state: string;
        avatarUrl?: string;
    };
}

export default function BriefingReminder({
    contactName,
    companyName,
    appointmentDate,
    appointmentTime,
    taskType,
    meetingUrl,
    sender,
}: BriefingReminderProps) {
    const isVideoCall = taskType?.toLowerCase().includes('video');

    return (
        <Html>
            <Head />
            <Preview>Briefing Reminder — 1 Hour // {contactName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={{ marginBottom: "32px" }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Img
                                src="https://nodalpoint.io/images/nodalpoint-webicon.png"
                                alt="Nodal Point Logo"
                                width="32"
                                height="32"
                                style={{ display: "block", marginRight: "12px" }}
                            />
                            <Text style={{ fontSize: "16px", fontWeight: "bold", fontFamily: "monospace", margin: 0, letterSpacing: "-0.5px", color: "#ffffff" }}>
                                NODAL_POINT <span style={{ color: "#444" }}>//</span> <span style={{ color: "#002FA7" }}>ADVISORY</span>
                            </Text>
                        </div>
                    </Section>

                    <Text style={headerLabel}>● REMINDER_SIGNAL // T-MINUS 60</Text>

                    <Section style={{ marginBottom: "24px" }}>
                        <Text style={mainHeading}>Your briefing starts in 1 hour.</Text>
                    </Section>

                    <Text style={bodyText}>
                        {contactName}, this is a reminder that your energy briefing with {sender.name} is scheduled to begin in approximately one hour.
                    </Text>

                    {/* Join button for Video Call — top of email, prominent */}
                    {isVideoCall && meetingUrl && (
                        <Section style={{ marginBottom: "28px", textAlign: "center" as const }}>
                            <Link href={meetingUrl} style={joinButton}>
                                ▶ JOIN VIDEO BRIEFING
                            </Link>
                            <Text style={{ color: "#555", fontSize: "10px", fontFamily: "monospace", margin: "10px 0 0", letterSpacing: "1px" }}>
                                {meetingUrl}
                            </Text>
                        </Section>
                    )}

                    {/* Details card */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// {companyName.toUpperCase()} // SESSION_DETAILS</Text>

                        <div style={gridRow}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>DATE</Text>
                                <Text style={itemValue}>{appointmentDate}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>TIME</Text>
                                <Text style={itemValue}>{appointmentTime} CST</Text>
                            </div>
                        </div>

                        <Hr style={hr} />

                        <div style={gridRow}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>ORGANIZATION</Text>
                                <Text style={itemValue}>{companyName}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>FORMAT</Text>
                                <Text style={itemValue}>{taskType.toUpperCase()}</Text>
                            </div>
                        </div>
                    </Section>

                    {/* For non-video calls, show contact info as joining instructions */}
                    {!isVideoCall && (
                        <Text style={bodyText}>
                            Please make sure you are available at the scheduled time. {sender.name} will reach out at{' '}
                            <Link href={`tel:${sender.phone}`} style={{ color: "#888" }}>{sender.phone}</Link>.
                        </Text>
                    )}

                    <Hr style={{ borderColor: "#1a1a1a", margin: "40px 0" }} />

                    {/* Signature */}
                    <Section style={signatureContainer}>
                        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                            {sender.avatarUrl && (
                                <Img
                                    src={sender.avatarUrl}
                                    alt={`Avatar for ${sender.name}`}
                                    width="44"
                                    height="44"
                                    style={{
                                        borderRadius: '10px',
                                        border: '1px solid #1a1a1a',
                                        objectFit: 'cover' as const,
                                        marginRight: '20px'
                                    }}
                                />
                            )}
                            <div style={{ flex: 1 }}>
                                <Text style={senderName}>{sender.name.toUpperCase()}</Text>
                                <Text style={senderTitle}>{sender.title.toUpperCase()}</Text>
                                <div style={{ marginTop: '12px', borderLeft: '1px solid #002FA7', paddingLeft: '12px' }}>
                                    <Link href={`tel:${sender.phone}`} style={contactLink}>{sender.phone}</Link>
                                    <Link href={`mailto:${sender.email}`} style={contactLink}>{sender.email}</Link>
                                    <Text style={locationText}>{sender.city.toUpperCase()}, {sender.state.toUpperCase()} // NODAL_POINT</Text>
                                </div>
                            </div>
                        </div>
                    </Section>

                    <Section style={{ marginTop: '40px', textAlign: 'center' as const }}>
                        <Text style={{ color: '#444', fontSize: '10px', fontFamily: 'monospace' }}>
                            This is an automated reminder generated by Nodal Point for {contactName} at {companyName}.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

const main = { backgroundColor: "#000", fontFamily: 'monospace', margin: "0" };
const container = { margin: "0 auto", padding: "40px 20px", maxWidth: "600px" };
const headerLabel = { color: "#002FA7", fontSize: "10px", fontFamily: "monospace", letterSpacing: "2px", fontWeight: "bold", margin: "0 0 8px" };
const mainHeading = { color: "#fff", fontSize: "28px", fontWeight: "bold", margin: "0", letterSpacing: "-1px", fontFamily: "sans-serif" };
const bodyText = { color: "#ccc", fontSize: "14px", lineHeight: "1.6", fontFamily: "monospace", margin: "20px 0" };
const dataCard = { backgroundColor: "#050505", border: "1px solid #1a1a1a", borderRadius: "12px", padding: "24px", margin: "32px 0" };
const cardLabel = { color: "#444", fontSize: "10px", fontFamily: "monospace", margin: "0 0 20px", letterSpacing: "1px" };
const gridRow = { display: "flex", justifyContent: "space-between", gap: "12px" };
const gridItem = { flex: 1 };
const itemLabel = { color: "#666", fontSize: "10px", fontWeight: "bold", fontFamily: "monospace", letterSpacing: "1px", margin: "0 0 4px" };
const itemValue = { color: "#fff", fontSize: "14px", fontWeight: "bold", margin: "0", fontFamily: "monospace" };
const hr = { borderColor: "#1a1a1a", margin: "20px 0" };
const signatureContainer = { marginTop: "20px" };
const senderName = { color: "#fff", fontSize: "16px", fontWeight: "bold", fontFamily: "monospace", margin: "0", letterSpacing: "1px" };
const senderTitle = { color: "#002FA7", fontSize: "10px", fontFamily: "monospace", margin: "4px 0 0", letterSpacing: "1px" };
const contactLink = { color: "#888", fontSize: "12px", textDecoration: "none", display: "block", margin: "4px 0", fontFamily: "monospace" };
const locationText = { color: "#444", fontSize: "10px", fontFamily: "monospace", margin: "8px 0 0", letterSpacing: "1px" };
const joinButton = {
    display: "inline-block",
    padding: "16px 32px",
    backgroundColor: "#002FA7",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "bold",
    fontFamily: "monospace",
    textDecoration: "none",
    letterSpacing: "2px",
    borderRadius: "4px",
};
