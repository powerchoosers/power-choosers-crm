export type SignatureStatus = 'pending' | 'opened' | 'viewed' | 'signed' | 'declined' | 'completed';

export interface SignatureRequest {
    id: string;
    document_id: string;
    contact_id?: string;
    account_id?: string;
    deal_id?: string;
    status: SignatureStatus;
    access_token: string;
    signed_document_path?: string;
    signature_fields?: { fieldId?: string; pageIndex: number; x: number; y: number; width: number; height: number; type?: 'signature' | 'text' }[];
    created_at: string;
    updated_at: string;

    // Relations
    document?: any; // You can explicitly type this based on the existing Document type
    contact?: any;
    account?: any;
    deal?: any;
}

export interface SignatureTelemetry {
    id: string;
    request_id: string;
    action: 'sent' | 'opened' | 'viewed' | 'signed' | 'declined';
    ip_address?: string;
    user_agent?: string;
    metadata?: any;
    created_at: string;
}
