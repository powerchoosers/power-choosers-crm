export type SignatureRequestKind = 'CONTRACT' | 'LOE'

export interface SignatureRequestKindConfig {
  kind: SignatureRequestKind
  uiLabel: string
  documentLabel: string
  storedDocumentType: 'CONTRACT' | 'PROPOSAL' | 'LOE'
  sourceDocumentTypes: string[]
  sourceAnalysisTypes: string[]
  executionDealStage: 'ENGAGED' | 'SECURED'
  promoteAccountToCustomer: boolean
}

const SIGNATURE_REQUEST_KIND_CONFIGS: Record<SignatureRequestKind, SignatureRequestKindConfig> = {
  CONTRACT: {
    kind: 'CONTRACT',
    uiLabel: 'Contract',
    documentLabel: 'Energy Agreement',
    storedDocumentType: 'CONTRACT',
    sourceDocumentTypes: ['CONTRACT'],
    sourceAnalysisTypes: ['CONTRACT', 'SIGNED_CONTRACT'],
    executionDealStage: 'SECURED',
    promoteAccountToCustomer: true,
  },
  LOE: {
    kind: 'LOE',
    uiLabel: 'LOE',
    documentLabel: 'Letter of Engagement',
    storedDocumentType: 'LOE',
    sourceDocumentTypes: ['LOE', 'PROPOSAL'],
    sourceAnalysisTypes: ['LOE', 'PROPOSAL'],
    executionDealStage: 'ENGAGED',
    promoteAccountToCustomer: false,
  },
}

export function normalizeSignatureRequestKind(value?: string | null): SignatureRequestKind {
  return value?.toUpperCase() === 'LOE' ? 'LOE' : 'CONTRACT'
}

export function getSignatureRequestKindConfig(value?: string | null): SignatureRequestKindConfig {
  return SIGNATURE_REQUEST_KIND_CONFIGS[normalizeSignatureRequestKind(value)]
}

export function inferSignatureRequestKindFromDocument(
  documentType?: string | null,
  aiType?: string | null
): SignatureRequestKind {
  const normalizedDocumentType = documentType?.toUpperCase() || ''
  const normalizedAiType = aiType?.toUpperCase() || ''

  if (
    normalizedDocumentType === 'PROPOSAL' ||
    normalizedDocumentType === 'LOE' ||
    normalizedAiType === 'PROPOSAL' ||
    normalizedAiType === 'LOE'
  ) {
    return 'LOE'
  }

  return 'CONTRACT'
}

export function documentMatchesSignatureRequestKind(
  document: { document_type?: string | null; metadata?: any } | null | undefined,
  kind: SignatureRequestKind
): boolean {
  const config = getSignatureRequestKindConfig(kind)
  const documentType = document?.document_type?.toUpperCase() || ''
  const aiType = document?.metadata?.ai_extraction?.type?.toUpperCase() || ''

  return (
    config.sourceDocumentTypes.includes(documentType) ||
    config.sourceAnalysisTypes.includes(aiType)
  )
}
