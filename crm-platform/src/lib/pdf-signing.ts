import { readFileSync } from 'fs'
import { PDFDocument } from 'pdf-lib'
import signpdf from '@signpdf/signpdf'
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib'
import { P12Signer } from '@signpdf/signer-p12'

export interface PdfSigningIdentity {
  name: string
  contactInfo: string
  reason: string
  location: string
  signingTime?: Date
  appName?: string
}

export interface PdfSigningConfig {
  name?: string
  contactInfo?: string
  location?: string
  reason?: string
  signingTime?: Date
  appName?: string
  signatureLength?: number
}

const DEFAULT_SIGNATURE_LENGTH = 16384

function decodeBase64PdfSigningMaterial(value: string) {
  const sanitized = value.trim().replace(/^data:.*;base64,/, '')
  return Buffer.from(sanitized, 'base64')
}

function assertSignedPdfLooksValid(pdfBytes: Buffer) {
  const pdfText = pdfBytes.toString('latin1')
  const hasByteRange = /\/ByteRange\s*\[[^\]]+\]/.test(pdfText)
  const hasSignatureDict = /\/Type\s*\/Sig/.test(pdfText)
  const hasContents = /\/Contents\s*<[^>]+>/.test(pdfText)

  if (!hasByteRange || !hasSignatureDict || !hasContents) {
    throw new Error('Generated PDF is missing a valid signature block.')
  }
}

export function loadPdfSigningCertificate(): Buffer {
  const base64Value =
    process.env.SIGNING_P12_BASE64 ||
    process.env.PDF_SIGNING_P12_BASE64 ||
    process.env.PDF_SIGNATURE_P12_BASE64
  const pathValue =
    process.env.SIGNING_P12_PATH ||
    process.env.PDF_SIGNING_P12_PATH ||
    process.env.PDF_SIGNATURE_P12_PATH

  if (base64Value) {
    return decodeBase64PdfSigningMaterial(base64Value)
  }

  if (pathValue) {
    return readFileSync(pathValue)
  }

  throw new Error(
    'Missing PDF signing certificate. Set SIGNING_P12_BASE64 with SIGNING_P12_PASSWORD, or SIGNING_P12_PATH with SIGNING_P12_PASSWORD.'
  )
}

export function getPdfSigningIdentity(overrides: PdfSigningConfig = {}): PdfSigningIdentity {
  const name =
    overrides.name ||
    process.env.SIGNING_SIGNER_NAME ||
    process.env.PDF_SIGNING_SIGNER_NAME ||
    'Nodal Point'

  const contactInfo =
    overrides.contactInfo ||
    process.env.SIGNING_SIGNER_EMAIL ||
    process.env.PDF_SIGNING_SIGNER_EMAIL ||
    'compliance@nodalpoint.io'

  const location =
    overrides.location ||
    process.env.SIGNING_SIGNER_LOCATION ||
    process.env.PDF_SIGNING_SIGNER_LOCATION ||
    'Texas, USA'

  const reason =
    overrides.reason ||
    process.env.SIGNING_REASON ||
    process.env.PDF_SIGNING_REASON ||
    'Customer executed document through the Nodal Point secure portal'

  return {
    name,
    contactInfo,
    location,
    reason,
    signingTime: overrides.signingTime,
    appName: overrides.appName || 'Nodal Point CRM',
  }
}

export async function signPdfDocument(pdfDoc: PDFDocument, overrides: PdfSigningConfig = {}): Promise<Buffer> {
  const identity = getPdfSigningIdentity(overrides)
  const signingTime = overrides.signingTime || new Date()
  const certificate = loadPdfSigningCertificate()
  const signer = new P12Signer(certificate, {
    passphrase:
      process.env.SIGNING_P12_PASSWORD ||
      process.env.PDF_SIGNING_P12_PASSWORD ||
      process.env.PDF_SIGNATURE_P12_PASSWORD ||
      '',
  })

  pdflibAddPlaceholder({
    pdfDoc,
    reason: identity.reason,
    contactInfo: identity.contactInfo,
    name: identity.name,
    location: identity.location,
    signingTime,
    signatureLength: overrides.signatureLength || DEFAULT_SIGNATURE_LENGTH,
    widgetRect: [0, 0, 0, 0],
    appName: identity.appName,
  })

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false })
  const signedPdf = await signpdf.sign(Buffer.from(pdfBytes), signer, signingTime)
  assertSignedPdfLooksValid(signedPdf)
  return signedPdf
}
