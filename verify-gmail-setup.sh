#!/bin/bash
# Gmail API Setup Verification Script
# Run this in Google Cloud Shell to verify your Gmail integration is ready

echo "=========================================="
echo "Gmail API Setup Verification"
echo "=========================================="
echo ""

# Set project
PROJECT_ID="power-choosers-crm"
gcloud config set project $PROJECT_ID

echo "1. Checking Gmail API is enabled..."
gcloud services list --enabled --filter="name:gmail.googleapis.com" --format="value(name)"
if [ $? -eq 0 ]; then
    echo "   ✓ Gmail API is enabled"
else
    echo "   ✗ Gmail API is NOT enabled"
    echo "   Run: gcloud services enable gmail.googleapis.com"
fi
echo ""

echo "2. Checking service account exists..."
gcloud iam service-accounts describe gmail-sender@${PROJECT_ID}.iam.gserviceaccount.com --format="value(email)" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✓ Service account exists"
    SERVICE_ACCOUNT_EMAIL="gmail-sender@${PROJECT_ID}.iam.gserviceaccount.com"
else
    echo "   ✗ Service account NOT found"
    exit 1
fi
echo ""

echo "3. Getting Client ID for Domain-Wide Delegation..."
CLIENT_ID=$(gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL --format="value(uniqueId)")
if [ -n "$CLIENT_ID" ]; then
    echo "   ✓ Client ID: $CLIENT_ID"
    echo "   → Make sure this is added in Google Workspace Admin → Domain-Wide Delegation"
    echo "   → Scope: https://www.googleapis.com/auth/gmail.send"
else
    echo "   ✗ Could not get Client ID"
fi
echo ""

echo "4. Checking Cloud Run environment variables..."
echo "   Checking if GOOGLE_SERVICE_ACCOUNT_KEY is set..."
gcloud run services describe power-choosers-crm \
    --region=us-south1 \
    --format="value(spec.template.spec.containers[0].env)" 2>/dev/null | grep -q "GOOGLE_SERVICE_ACCOUNT_KEY"
if [ $? -eq 0 ]; then
    echo "   ✓ GOOGLE_SERVICE_ACCOUNT_KEY is set"
else
    echo "   ✗ GOOGLE_SERVICE_ACCOUNT_KEY is NOT set in Cloud Run"
    echo "   → Add it via Cloud Build trigger substitution variables"
fi
echo ""

echo "5. Testing service account key decoding..."
if [ -f "gmail-service-account.json" ]; then
    echo "   ✓ Service account key file exists"
    # Test if it's valid JSON
    python3 -m json.tool gmail-service-account.json > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "   ✓ Service account key is valid JSON"
        # Check if it has required fields
        if grep -q "client_email" gmail-service-account.json && grep -q "private_key" gmail-service-account.json; then
            echo "   ✓ Service account key has required fields"
        else
            echo "   ✗ Service account key missing required fields"
        fi
    else
        echo "   ✗ Service account key is NOT valid JSON"
    fi
else
    echo "   ⚠ Service account key file not found (this is okay if you're using base64 env var)"
fi
echo ""

echo "6. Checking Cloud Build trigger substitution variables..."
echo "   (This requires Cloud Build API access)"
gcloud builds triggers list --format="table(name,substitutions)" 2>/dev/null | grep -q "GOOGLE_SERVICE_ACCOUNT_KEY"
if [ $? -eq 0 ]; then
    echo "   ✓ GOOGLE_SERVICE_ACCOUNT_KEY found in triggers"
else
    echo "   ⚠ GOOGLE_SERVICE_ACCOUNT_KEY not found in triggers (check manually in Console)"
fi
echo ""

echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""
echo "Before testing, ensure:"
echo "1. ✓ Gmail API is enabled"
echo "2. ✓ Service account exists"
echo "3. ✓ Domain-Wide Delegation is configured in Google Workspace Admin"
echo "   → Client ID: $CLIENT_ID"
echo "   → Scope: https://www.googleapis.com/auth/gmail.send"
echo "4. ✓ GOOGLE_SERVICE_ACCOUNT_KEY is set in Cloud Build triggers"
echo "5. ✓ Cloud Run service has the environment variable"
echo ""
echo "To test Gmail API connection, run:"
echo "  node test-gmail-connection.js"
echo ""

