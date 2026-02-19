import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Text,
    Button,
    Img,
    Hr,
    Row,
    Column,
} from '@react-email/components'
import * as React from 'react'

export interface FoundryBlock {
    id: string
    type: 'TEXT_MODULE' | 'TACTICAL_BUTTON' | 'TELEMETRY_GRID' | 'VARIABLE_CHIP' | 'LIABILITY_GAUGE' | 'IMAGE_BLOCK' | 'MARKET_BREADCRUMB'
    content: any
}

interface FoundryTemplateProps {
    blocks: FoundryBlock[]
    options?: {
        skipFooter?: boolean
        profile?: {
            firstName?: string
            lastName?: string
            jobTitle?: string
            selectedPhoneNumber?: string
            city?: string
            state?: string
            hostedPhotoUrl?: string
            photoURL?: string
            linkedinUrl?: string
        }
    }
}

export default function FoundryTemplate({
    blocks = [],
    options = {},
}: FoundryTemplateProps) {
    const { skipFooter, profile } = options

    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Lewis Patterson'
    const title = profile?.jobTitle || 'Director of Energy Architecture'
    const phone = profile?.selectedPhoneNumber || '+1 (817) 809-3367'
    const location = [profile?.city, profile?.state].filter(Boolean).join(', ') || 'Fort Worth, TX'
    const photoUrl = profile?.hostedPhotoUrl || profile?.photoURL || ''
    const linkedinUrl = profile?.linkedinUrl || 'https://linkedin.com/company/nodal-point'

    return (
        <Html>
            <Head />
            <Preview>{(blocks[0]?.content?.text || 'Nodal Point Intelligence').slice(0, 100)}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* HEADER */}
                    <Section style={header}>
                        <Row>
                            <Column style={headerLeft}>
                                <Img
                                    src="https://nodalpoint.io/images/nodalpoint-webicon.png"
                                    width="18"
                                    height="18"
                                    alt="Nodal Point"
                                    style={logo}
                                />
                                <Text style={brandText}>NODAL_POINT // INTELLIGENCE</Text>
                            </Column>
                            <Column style={headerRight}>
                                <Text style={refText}>REF: {'{{date}}'} // {'{{context_id}}'}</Text>
                            </Column>
                        </Row>
                    </Section>

                    {/* CONTENT BLOCKS */}
                    <Section style={contentSection}>
                        {blocks.map((block) => {
                            // TEXT_MODULE
                            if (block.type === 'TEXT_MODULE') {
                                const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content ?? ''), useAi: false, aiPrompt: '' }
                                const text = contentObj.text || ''
                                const bullets = contentObj.bullets || []
                                const useAi = contentObj.useAi ?? false

                                if (useAi && !text.trim()) {
                                    return (
                                        <Section key={block.id} style={aiLoadingBox}>
                                            <Text style={aiLoadingText}>[ AI_GENERATION_IN_PROGRESS ]</Text>
                                        </Section>
                                    )
                                }

                                return (
                                    <Section key={block.id} style={blockMargin}>
                                        <Text style={paragraph}>
                                            {text.split(/\n\n+/).map((p: string, i: number) => (
                                                <React.Fragment key={i}>
                                                    {p}
                                                    {i < text.split(/\n\n+/).length - 1 && <br />}
                                                    {i < text.split(/\n\n+/).length - 1 && <br />}
                                                </React.Fragment>
                                            ))}
                                        </Text>

                                        {bullets.length > 0 && (
                                            <Section style={bulletSection}>
                                                {bullets.map((bullet: string, i: number) => (
                                                    <Row key={i} style={bulletRow}>
                                                        <Column style={bulletDotCol}>●</Column>
                                                        <Column style={bulletTextCol}>{bullet}</Column>
                                                    </Row>
                                                ))}
                                            </Section>
                                        )}
                                    </Section>
                                )
                            }

                            // TACTICAL_BUTTON
                            if (block.type === 'TACTICAL_BUTTON') {
                                return (
                                    <Section key={block.id} style={buttonContainer}>
                                        <Button href={'{{cta_url}}'} style={button}>
                                            {block.content}
                                        </Button>
                                    </Section>
                                )
                            }

                            // TELEMETRY_GRID
                            if (block.type === 'TELEMETRY_GRID') {
                                const headers = block.content.headers || []
                                const rows = block.content.rows || []
                                const valueColors = block.content.valueColors || []

                                const getValueStyle = (color: string) => {
                                    if (color === 'yellow') return { color: '#b45309' }
                                    if (color === 'red') return { color: '#dc2626' }
                                    if (color === 'black') return { color: '#18181b' }
                                    return { color: '#059669' }
                                }

                                return (
                                    <Section key={block.id} style={gridContainer}>
                                        <Row style={gridHeaderRow}>
                                            {headers.map((h: string, i: number) => (
                                                <Column key={i} style={gridHeaderCell}>{h}</Column>
                                            ))}
                                        </Row>
                                        {rows.map((row: string[], ri: number) => {
                                            const rowColor = valueColors[ri] ?? 'green'
                                            const valueStyle = getValueStyle(rowColor)
                                            return (
                                                <Row key={ri}>
                                                    {row.map((cell: string, ci: number) => (
                                                        <Column key={ci} style={{ ...gridCell, ...(ci > 0 ? valueStyle : { color: '#18181b' }) }}>
                                                            {cell}
                                                        </Column>
                                                    ))}
                                                </Row>
                                            )
                                        })}
                                    </Section>
                                )
                            }

                            // MARKET_BREADCRUMB
                            if (block.type === 'MARKET_BREADCRUMB') {
                                const c = block.content || {}
                                const headline = c.headline ?? 'ERCOT_RESERVES_DROP_BELOW_3000MW'
                                const source = c.source ?? 'GridMonitor_Intelligence'
                                const impactLevel = c.impactLevel ?? 'HIGH_VOLATILITY'
                                const url = c.url
                                const nodalAnalysis = c.nodalAnalysis

                                return (
                                    <Section key={block.id} style={breadcrumbContainer}>
                                        <Section style={breadcrumbHeader}>
                                            <Row>
                                                <Column>
                                                    <Text style={breadcrumbSource}>Source: {source}</Text>
                                                </Column>
                                                <Column style={breadcrumbImpactCol}>
                                                    <Text style={breadcrumbImpact}>[ {impactLevel} ]</Text>
                                                </Column>
                                            </Row>
                                        </Section>
                                        <Section style={breadcrumbContent}>
                                            <Text style={breadcrumbHeadline}>{headline}</Text>
                                            {nodalAnalysis && (
                                                <Section style={analysisBox}>
                                                    <Text style={analysisLabel}>Nodal_Architect_Analysis:</Text>
                                                    <Text style={analysisText}>"{nodalAnalysis}"</Text>
                                                </Section>
                                            )}
                                            {url && (
                                                <Text style={breadcrumbLink}>
                                                    <a href={url} style={{ color: '#002FA7', textDecoration: 'underline' }}>[ VIEW_FULL_TRANSMISSION ]</a>
                                                </Text>
                                            )}
                                        </Section>
                                    </Section>
                                )
                            }

                            // VARIABLE_CHIP
                            if (block.type === 'VARIABLE_CHIP') {
                                return (
                                    <Text key={block.id} style={variableChip}>
                                        {block.content}
                                    </Text>
                                )
                            }

                            // LIABILITY_GAUGE
                            if (block.type === 'LIABILITY_GAUGE') {
                                const c = block.content || {}
                                const baselineLabel = c.baselineLabel ?? 'CURRENT_FIXED_RATE'
                                const riskLevel = Math.min(100, Math.max(0, Number(c.riskLevel) ?? 75))
                                const status = c.status ?? 'VOLATILE'
                                const note = c.note

                                return (
                                    <Section key={block.id} style={gaugeContainer}>
                                        <Row style={gaugeHeader}>
                                            <Column>
                                                <Text style={gaugeLabel}>{baselineLabel}</Text>
                                                <Text style={gaugeValue}>${'{{contact.currentRate}}'}/kWh</Text>
                                            </Column>
                                            <Column style={{ textAlign: 'right' }}>
                                                <Text style={gaugeRiskLabel}>{status}</Text>
                                                <Text style={gaugeRiskValue}>{riskLevel}%</Text>
                                            </Column>
                                        </Row>
                                        <Section style={gaugeTrack}>
                                            <Section style={{ ...gaugeFill, width: `${riskLevel}%` }} />
                                        </Section>
                                        {note && (
                                            <Text style={gaugeNote}>{note}</Text>
                                        )}
                                    </Section>
                                )
                            }

                            // IMAGE_BLOCK
                            if (block.type === 'IMAGE_BLOCK') {
                                const c = block.content || {}
                                return (
                                    <Section key={block.id} style={imageContainer}>
                                        {c.url && (
                                            <Img src={c.url} alt={c.description || ''} style={image} />
                                        )}
                                        {c.caption && (
                                            <Text style={caption}>{c.caption}</Text>
                                        )}
                                    </Section>
                                )
                            }

                            return null
                        })}
                    </Section>

                    {/* FOOTER */}
                    {!skipFooter && (
                        <Section style={footer}>
                            <Section style={footerContent}>
                                <Row>
                                    {photoUrl && (
                                        <Column style={footerPhotoCol}>
                                            <Img src={photoUrl} width="40" height="40" alt={name} style={footerPhoto} />
                                        </Column>
                                    )}
                                    <Column style={footerInfoCol}>
                                        <Text style={footerName}>{name}</Text>
                                        <Text style={footerTitle}>{title}</Text>
                                    </Column>
                                </Row>

                                <Section style={footerContact}>
                                    <Text style={contactLine}>P: {phone}</Text>
                                    <Text style={contactLine}>{location}</Text>
                                </Section>

                                <Section style={footerLinksContainer}>
                                    <Row style={{ width: 'auto' }}>
                                        <Column style={linkColumn}>
                                            <a href={linkedinUrl} style={linkStyle}>LINKEDIN</a>
                                        </Column>
                                        <Column style={separatorColumn}>//</Column>
                                        <Column style={linkColumn}>
                                            <a href="https://nodalpoint.io" style={linkStyle}>HQ</a>
                                        </Column>
                                        <Column style={separatorColumn}>//</Column>
                                        <Column style={linkColumn}>
                                            <a href="https://nodalpoint.io/bill-debugger" style={linkStyle}>[ RUN_AUDIT ]</a>
                                        </Column>
                                    </Row>
                                </Section>
                            </Section>
                        </Section>
                    )}
                </Container>
            </Body>
        </Html>
    )
}

// STYLES
const main = {
    backgroundColor: '#ffffff',
    fontFamily: "'Inter', sans-serif",
    color: '#18181b',
}

const container = {
    margin: '0 auto',
    width: '100%',
    maxWidth: '600px',
    border: '1px solid #e4e4e7',
    borderCollapse: 'separate' as const,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
}

const header = {
    borderBottom: '1px solid #e4e4e7',
    padding: '20px 32px',
    width: '100%',
}

const headerLeft = {
    width: '70%',
    verticalAlign: 'middle',
}

const headerRight = {
    width: '30%',
    textAlign: 'right' as const,
    verticalAlign: 'middle',
}

const logo = {
    display: 'inline-block',
    verticalAlign: 'middle',
    marginRight: '10px',
    width: '18px',
    height: '18px',
}

const brandText = {
    fontFamily: 'monospace',
    fontSize: '9px',
    fontWeight: 'bold',
    letterSpacing: '2px',
    color: '#18181b',
    display: 'inline-block',
    verticalAlign: 'middle',
    margin: 0,
    whiteSpace: 'nowrap' as const,
}

const refText = {
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#71717a',
    margin: 0,
}

const contentSection = {
    padding: '32px 32px',
}

const blockMargin = {
    marginBottom: '24px',
}

const paragraph = {
    lineHeight: '1.25',
    fontSize: '13px',
    margin: '0 0 16px 0',
}

const aiLoadingBox = {
    border: '2px dashed #e4e4e7',
    borderRadius: '8px',
    padding: '30px',
    backgroundColor: '#fafafa',
    textAlign: 'center' as const,
    marginBottom: '20px',
}

const aiLoadingText = {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#a1a1aa',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    margin: 0,
}

const bulletSection = {
    marginTop: '20px',
}

const bulletRow = {
    marginBottom: '10px',
}

const bulletDotCol = {
    width: '20px',
    color: '#002FA7',
    fontSize: '16px',
    lineHeight: '1.2',
    verticalAlign: 'top',
}

const bulletTextCol = {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#52525b',
    lineHeight: '1.4',
    paddingLeft: '10px',
    verticalAlign: 'top',
}

const buttonContainer = {
    margin: '30px 0',
    textAlign: 'center' as const,
}

const button = {
    backgroundColor: '#002FA7',
    color: '#ffffff',
    padding: '12px 24px',
    textDecoration: 'none',
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 'bold',
    letterSpacing: '1px',
    borderRadius: '2px',
}

const gridContainer = {
    backgroundColor: '#f4f4f5',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '24px',
    border: '1px solid #e4e4e7',
}

const gridHeaderRow = {
    borderBottom: '1px solid #d4d4d8',
}

const gridHeaderCell = {
    padding: '8px 0',
    fontSize: '10px',
    color: '#71717a',
    textTransform: 'uppercase' as const,
    textAlign: 'left' as const,
}

const gridCell = {
    padding: '8px 12px 8px 0',
    fontFamily: 'monospace',
    fontSize: '12px',
}

const breadcrumbContainer = {
    border: '1px solid #e4e4e7',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
}

const breadcrumbHeader = {
    backgroundColor: '#f4f4f5',
    padding: '8px 16px',
    borderBottom: '1px solid #e4e4e7',
}

const breadcrumbSource = {
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#71717a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: 0,
}

const breadcrumbImpactCol = {
    textAlign: 'right' as const,
}

const breadcrumbImpact = {
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#002FA7',
    fontWeight: 'bold',
    margin: 0,
}

const breadcrumbContent = {
    padding: '16px',
}

const breadcrumbHeadline = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#18181b',
    lineHeight: '1.3',
    textTransform: 'uppercase' as const,
    fontFamily: 'monospace',
    margin: '0 0 12px 0',
}

const analysisBox = {
    backgroundColor: '#18181b',
    padding: '12px',
    borderRadius: '2px',
    borderLeft: '4px solid #002FA7',
    marginBottom: '12px',
}

const analysisLabel = {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#a1a1aa',
    textTransform: 'uppercase' as const,
    margin: '0 0 4px 0',
}

const analysisText = {
    fontSize: '12px',
    color: '#ffffff',
    lineHeight: '1.5',
    fontStyle: 'italic',
    margin: 0,
}

const breadcrumbLink = {
    fontFamily: 'monospace',
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: 0,
}

const variableChip = {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#002FA7',
}

const gaugeContainer = {
    backgroundColor: '#f4f4f5',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '24px',
    border: '1px solid #e4e4e7',
}

const gaugeHeader = {
    marginBottom: '12px',
    alignItems: 'flex-end',
}

const gaugeLabel = {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#71717a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: '0 0 4px 0',
}

const gaugeValue = {
    fontFamily: 'monospace',
    fontSize: '20px',
    color: '#18181b',
    margin: 0,
}

const gaugeRiskLabel = {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#002FA7',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: '0 0 4px 0',
}

const gaugeRiskValue = {
    fontFamily: 'monospace',
    fontSize: '20px',
    color: '#18181b',
    margin: 0,
}

const gaugeTrack = {
    height: '8px',
    width: '100%',
    backgroundColor: '#d4d4d8',
    borderRadius: '4px',
    overflow: 'hidden',
}

const gaugeFill = {
    height: '100%',
    backgroundColor: '#002FA7',
}

const gaugeNote = {
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#52525b',
    lineHeight: '1.4',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: '12px 0 0 0',
}

const imageContainer = {
    margin: '20px 0',
}

const image = {
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
}

const caption = {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#71717a',
    marginTop: '8px',
}

const footer = {
    marginTop: '40px',
    borderTop: '1px solid #f4f4f5',
    backgroundColor: '#fafafa',
    fontFamily: 'sans-serif',
}

const footerContent = {
    padding: '32px 32px',
}

const footerPhotoCol = {
    width: '48px',
    verticalAlign: 'middle' as const,
    paddingRight: '12px',
}

const footerPhoto = {
    borderRadius: '12px',
    border: '1px solid #e4e4e7',
    display: 'block',
    objectFit: 'cover' as const,
}

const footerInfoCol = {
    verticalAlign: 'middle' as const,
}

const footerName = {
    fontWeight: 'bold',
    color: '#18181b',
    fontSize: '14px',
    lineHeight: '1.2',
    margin: 0,
}

const footerTitle = {
    color: '#71717a',
    fontSize: '12px',
    marginTop: '2px',
    margin: 0,
}

const footerContact = {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#52525b',
    lineHeight: '1.5',
    marginBottom: '20px',
    letterSpacing: '0.02em',
    marginTop: '16px',
}

const contactLine = {
    margin: 0,
}

const footerLinksContainer = {
    width: '100%',
    marginTop: '0px',
}

const linkColumn = {
    width: 'auto',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
}

const separatorColumn = {
    color: '#d4d4d8',
    padding: '0 8px',
    width: '24px',
    textAlign: 'center' as const,
    fontFamily: 'monospace',
    fontSize: '10px',
}

const linkStyle = {
    color: '#002FA7',
    textDecoration: 'none',
    fontFamily: 'monospace',
    fontSize: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
}
