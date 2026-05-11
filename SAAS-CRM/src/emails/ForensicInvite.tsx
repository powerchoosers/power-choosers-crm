import { Html, Body, Container, Text, Section, Head, Preview, Hr, Link, Img } from "@react-email/components";
import * as React from 'react';

interface ForensicInviteProps {
    contactName: string;
    companyName: string;
    appointmentDate: string;
    appointmentTime: string;
    description?: string;
    manualIntro?: string;
    operationalVector?: string;
    taskId?: string;
    prospectEmail?: string;
    baseUrl?: string;
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

export default function ForensicInvite({
    contactName,
    companyName,
    appointmentDate,
    appointmentTime,
    description,
    manualIntro,
    operationalVector = 'Meeting',
    taskId,
    prospectEmail,
    baseUrl = 'https://nodalpoint.io',
    meetingUrl,
    sender
}: ForensicInviteProps) {
    return (
        <Html>
            <Head />
            <Preview>Meeting invitation // {contactName}</Preview>
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
                                NODAL POINT <span style={{ color: "#444" }}>//</span> <span style={{ color: "#002FA7" }}>ADVISORY</span>
                            </Text>
                        </div>
                    </Section>

                    <Text style={headerLabel}>
                        ● INVITE
                    </Text>
                    <Section style={{ marginBottom: "24px" }}>
                        <Text style={mainHeading}>
                            Meeting details for {contactName}.
                        </Text>
                    </Section>

                    {/* Briefing Payload */}
                    <Text style={bodyText}>
                        {manualIntro || `A meeting has been scheduled for ${contactName}. We will review the bill and the main next steps for ${companyName}.`}
                    </Text>

                    {/* Data Grid */}
                    <Section style={dataCard}>
                        <Text style={cardLabel}>// {companyName.toUpperCase()} // MEETING_DETAILS</Text>

                        <div style={gridRow}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>DATE</Text>
                                <Text style={itemValue}>{appointmentDate}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>TIME</Text>
                                <Text style={itemValue}>{appointmentTime}</Text>
                            </div>
                        </div>

                        <Hr style={hr} />

                        <div style={gridRow}>
                            <div style={gridItem}>
                                <Text style={itemLabel}>COMPANY</Text>
                                <Text style={itemValue}>{companyName}</Text>
                            </div>
                            <div style={gridItem}>
                                <Text style={itemLabel}>MEETING TYPE</Text>
                                <Text style={itemValue}>{operationalVector}</Text>
                            </div>
                        </div>

                        {meetingUrl && (
                            <>
                                <Hr style={hr} />
                                <Text style={itemLabel}>VIDEO LINK</Text>
                                <Link href={meetingUrl} style={meetingLinkStyle}>
                                    ▶ JOIN MEETING
                                </Link>
                            </>
                        )}
                    </Section>

                    {/* RSVP Protocol */}
                    {taskId && prospectEmail && (
                        <Section style={rsvpContainer}>
                            <Text style={cardLabel}>// PLEASE_RESPOND</Text>
                            <div style={{ display: 'inline-block' }}>
                                <Link
                                    href={`${baseUrl}/api/public/rsvp?action=accept&task=${taskId}&email=${encodeURIComponent(prospectEmail)}`}
                                    style={buttonConfirm}
                                >
                                    Accept invitation
                                </Link>
                                <span style={{ display: 'inline-block', width: '16px' }}></span>
                                <Link
                                    href={`${baseUrl}/api/public/rsvp?action=decline&task=${taskId}&email=${encodeURIComponent(prospectEmail)}`}
                                    style={buttonReject}
                                >
                                    Decline invitation
                                </Link>
                            </div>
                        </Section>
                    )}

                    {/* Closing */}
                    <Text style={bodyText}>
                        Please use the buttons above or your calendar controls to confirm your availability.
                    </Text>

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
                                    <Link href={`tel:${sender.phone}`} style={contactLink}>
                                        {sender.phone}
                                    </Link>
                                    <Link href={`mailto:${sender.email}`} style={contactLink}>
                                        {sender.email}
                                    </Link>
                                    <Text style={locationText}>
                                        {sender.city.toUpperCase()}, {sender.state.toUpperCase()} // NODAL POINT
                                    </Text>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* Compliance Footer */}
                    <Section style={{ marginTop: '40px', textAlign: 'center' as const }}>
                        <Text style={{ color: '#444', fontSize: '10px', fontFamily: 'monospace' }}>
                            This message was generated by Nodal Point for {contactName} at {companyName}.
                            If this was sent in error, please disregard.
                        </Text>
                    </Section>

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
    fontSize: "10px",
    fontFamily: "monospace",
    letterSpacing: "2px",
    fontWeight: "bold",
    margin: "0 0 8px",
};

const mainHeading = {
    color: "#fff",
    fontSize: "28px",
    fontWeight: "bold",
    margin: "0",
    letterSpacing: "-1px",
    fontFamily: "sans-serif",
};

const bodyText = {
    color: "#ccc",
    fontSize: "14px",
    lineHeight: "1.6",
    fontFamily: "monospace",
    margin: "20px 0",
};

const dataCard = {
    backgroundColor: "#050505",
    border: "1px solid #1a1a1a",
    borderRadius: "12px",
    padding: "24px",
    margin: "32px 0",
};

const cardLabel = {
    color: "#444",
    fontSize: "10px",
    fontFamily: "monospace",
    margin: "0 0 20px",
    letterSpacing: "1px",
};

const gridRow = {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
};

const gridItem = {
    flex: 1,
};

const itemLabel = {
    color: "#666",
    fontSize: "10px",
    fontWeight: "bold",
    fontFamily: "monospace",
    letterSpacing: "1px",
    margin: "0 0 4px",
};

const itemValue = {
    color: "#fff",
    fontSize: "14px",
    fontWeight: "bold",
    margin: "0",
    fontFamily: "monospace",
};

const hr = {
    borderColor: "#1a1a1a",
    margin: "20px 0",
};

const signatureContainer = {
    marginTop: "20px",
};

const senderName = {
    color: "#fff",
    fontSize: "16px",
    fontWeight: "bold",
    fontFamily: "monospace",
    margin: "0",
    letterSpacing: "1px",
};

const senderTitle = {
    color: "#002FA7",
    fontSize: "10px",
    fontFamily: "monospace",
    margin: "4px 0 0",
    letterSpacing: "1px",
};

const contactLink = {
    color: "#888",
    fontSize: "12px",
    textDecoration: "none",
    display: "block",
    margin: "4px 0",
    fontFamily: "monospace",
};

const locationText = {
    color: "#444",
    fontSize: "10px",
    fontFamily: "monospace",
    margin: "8px 0 0",
    letterSpacing: "1px",
};

const rsvpContainer = {
    marginTop: "10px",
    marginBottom: "30px",
    padding: "20px",
    border: "1px dashed #333",
    backgroundColor: "#050505",
};

const buttonConfirm = {
    backgroundColor: "transparent",
    border: "1px solid #002FA7",
    color: "#002FA7",
    padding: "12px 20px",
    textDecoration: "none",
    fontSize: "12px",
    fontWeight: "bold",
    fontFamily: "monospace",
    display: "inline-block",
};

const buttonReject = {
    backgroundColor: "transparent",
    border: "1px solid #333",
    color: "#666",
    padding: "12px 20px",
    textDecoration: "none",
    fontSize: "12px",
    fontWeight: "bold",
    fontFamily: "monospace",
    display: "inline-block",
};

const meetingLinkStyle = {
    display: "inline-block",
    marginTop: "8px",
    padding: "10px 20px",
    backgroundColor: "#002FA7",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "bold",
    fontFamily: "monospace",
    textDecoration: "none",
    letterSpacing: "1px",
    borderRadius: "4px",
};


