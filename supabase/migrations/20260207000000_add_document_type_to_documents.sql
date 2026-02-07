-- Add document_type for Vault smart views (CONTRACT, INVOICE, USAGE_DATA, PROPOSAL)
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS document_type text;

COMMENT ON COLUMN public.documents.document_type IS 'Business document category: CONTRACT, INVOICE, USAGE_DATA, PROPOSAL';
