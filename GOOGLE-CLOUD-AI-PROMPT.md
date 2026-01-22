# Google Cloud AI Assistant Prompt
## Copy and paste this into Google Cloud AI Assistant

---

## Prompt to Copy:

```
I have a Google Cloud Application Load Balancer with a Serverless Network Endpoint Group (NEG) pointing to a Cloud Run service. The backend service protocol is set to HTTPS, but Cloud Run services should receive HTTP traffic from load balancers (the load balancer handles SSL termination). 

When I try to edit the backend service, the Protocol field shows "HTTPS" but it's not editable - it appears to be locked when using a Serverless NEG. The dropdown for backend type shows "Serverless network endpoint group" is selected, and when I look at the protocol options, only HTTPS is available.

My setup:
- Load Balancer: powerchoosers-load-balancer
- Backend Service: powerchoosers-backend
- Backend Type: Serverless network endpoint group
- NEG: powerchoosers-neg (points to Cloud Run service power-choosers-crm in us-south1)
- Current Protocol: HTTPS (locked/unchangeable)
- Cloud Run Service: power-choosers-crm (port 8080, HTTP)

The issue: powerchoosers.com shows "ERR_CONNECTION_CLOSED" even though the SSL certificate is ACTIVE. I believe this is because the backend is trying to connect to Cloud Run via HTTPS, but Cloud Run expects HTTP.

Question: How do I change the backend service protocol from HTTPS to HTTP when using a Serverless NEG? Or is HTTPS the correct protocol for Serverless NEGs with Cloud Run, and the issue is something else?
```

---

## Alternative Shorter Prompt:

```
My Application Load Balancer backend service uses a Serverless NEG pointing to Cloud Run. The protocol is locked to HTTPS, but I need HTTP. How do I change it? The Protocol field is not editable when using Serverless network endpoint group.
```

---

## Where to Use This:

1. **Google Cloud Console:**
   - Click the **AI Assistant** icon (usually in the top right)
   - Or press **Ctrl+/** (Windows) or **Cmd+/** (Mac)
   - Paste the prompt

2. **Google Cloud Shell:**
   - Type your question directly
   - Or use the AI Assistant feature

---

## What to Look For in the Response:

The AI should tell you:
- Whether HTTPS is actually correct for Serverless NEGs
- How to change the protocol (if possible)
- Alternative solutions if protocol can't be changed
- Whether the issue is actually Cloud Run ingress settings instead

---

**Last Updated:** November 21, 2025


