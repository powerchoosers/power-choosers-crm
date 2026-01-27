The ERROR: (gcloud.run.deploy) argument --set-env-vars: Invalid flag value [] indicates that the gcloud command is receiving an empty or malformed string for its environment variables. This typically happens when the value provided to --set-env-vars is not correctly parsed as a list of key-value pairs.

Here's a breakdown of why this might be happening and how to address it:

Why is gcloud seeing an empty list [] for --set-env-vars ?
The most common reasons for this error are:

Undefined Substitution Variables: One or more of your ${_...} substitution variables (e.g., _NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID , _PERPLEXITY_API_KEY ) are not defined in your Cloud Build trigger. When Cloud Build processes the cloudbuild.yaml , an undefined substitution might resolve to an empty string. If this empty string is then part of the comma-separated list, it can lead to a malformed argument that gcloud interprets as an empty list [] . For example, if _CRON_SECRET is undefined, the string might become ...,CRON_SECRET=,,GOOGLE_MAPS_API=... , which can confuse the parser.
Syntax Error in the Comma-Separated List: While less common with Cloud Build's substitution mechanism, a stray comma (e.g., a trailing comma after the last variable, or a double comma ,, if a substitution resolves to an empty string) could cause the parser to interpret the list incorrectly, resulting in an empty set of variables.
Entire String Resolves to Empty: If, after all substitutions, the entire string provided to --set-env-vars becomes empty, gcloud would also report this error.
Debugging Steps:
Check Cloud Build Logs: The most effective way to diagnose this is to examine the Cloud Build logs for the specific build step. Cloud Build often prints the command after substitutions have been applied. Look for the gcloud run deploy command and inspect the exact string passed to --set-env-vars . This will reveal if any substitutions are resolving to empty strings or if there's a syntax issue.
Isolate Variables: Temporarily reduce the number of environment variables in your --set-env-vars list. Start with just a few, then gradually add more until the error reappears. This can help pinpoint the specific variable or section causing the problem.
Verify Substitutions: Double-check that all substitution variables (e.g., _NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID , _PERPLEXITY_API_KEY ) are correctly defined in your Cloud Build trigger's substitution variables.
Best Practices for Formatting a Long List of Environment Variables:
For a long list of environment variables, especially when using substitutions, your current single-line comma-separated string can be prone to errors and difficult to read. Here are better approaches:

Use Multiple --set-env-vars Flags (Recommended for non-sensitive variables):
This makes each variable assignment explicit and easier to debug. If one substitution fails, it's isolated to that specific flag, rather than potentially corrupting the entire list.
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  entrypoint: gcloud
  args:
  - 'run'
  - 'deploy'
  - 'power-choosers-crm'
  - '--image'
  - 'gcr.io/$PROJECT_ID/power-choosers-crm:$COMMIT_SHA'
  - '--region'
  - 'us-south1'
  - '--platform'
  - 'managed'
  - '--allow-unauthenticated'
  - '--port'
  - '3000'
  - '--memory'
  - '512Mi'
  - '--cpu'
  - '1'
  - '--cpu-throttling'
  - '--min-instances'
  - '0'
  - '--max-instances'
  - '10'
  - '--concurrency'
  - '40'
  # Use separate --set-env-vars for each variable
  - '--set-env-vars=NODE_ENV=production'
  - '--set-env-vars=LOG_LEVEL=warn'
  - '--set-env-vars=VERBOSE_LOGS=false'
  - '--set-env-vars=NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}'
  - '--set-env-vars=NEXT_PUBLIC_FIREBASE_APP_ID=${_NEXT_PUBLIC_FIREBASE_APP_ID}'
  - '--set-env-vars=NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}'
  - '--set-env-vars=NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}'
  - '--set-env-vars=NEXT_PUBLIC_FIREBASE_API_KEY=${_NEXT_PUBLIC_FIREBASE_API_KEY}'
  - '--set-env-vars=GOOGLE_MAPS_API=${_GOOGLE_MAPS_API}'
  - '--set-env-vars=CI_AUTO_PROCESS=${_CI_AUTO_PROCESS}'
  - '--set-env-vars=API_BASE_URL=${_API_BASE_URL}'
  - '--set-env-vars=PUBLIC_BASE_URL=${_PUBLIC_BASE_URL}'
  - '--set-env-vars=GMAIL_SENDER_EMAIL=${_GMAIL_SENDER_EMAIL}'
  - '--set-env-vars=GMAIL_SENDER_NAME=${_GMAIL_SENDER_NAME}'
  - '--set-env-vars=GOOGLE_CLIENT_ID=${_GOOGLE_CLIENT_ID}'
  - '--set-env-vars=GOOGLE_CLIENT_SECRET=${_GOOGLE_CLIENT_SECRET}'
  # For sensitive variables, see the Secret Manager recommendation below
Leverage Secret Manager for Sensitive Variables (Highly Recommended for Security):
Many of your variables (e.g., PERPLEXITY_API_KEY , CRON_SECRET , TWILIO_AUTH_TOKEN , FIREBASE_PRIVATE_KEY ) appear to be sensitive credentials. Storing them directly as Cloud Build substitutions is not ideal for security. Google Cloud Secret Manager is designed for this purpose, providing secure storage, versioning, and access control for your secrets. Steps:
a. Store secrets in Secret Manager:
You can create secrets using the gcloud CLI or the Google Cloud Console.
bash gcloud secrets create PERPLEXITY_API_KEY --replication-policy="automatic" --data-file=/path/to/perplexity_api_key.txt # Repeat for all sensitive variables
Ensure you replace /path/to/perplexity_api_key.txt with the actual path to a file containing your secret value. b. Grant Cloud Run service account access: Ensure the Cloud Run service account (typically PROJECT_NUMBER-compute@developer.gserviceaccount.com or a custom service account you've configured for your Cloud Run service) has the Secret Manager Secret Accessor role on each of the secrets you want to use. c. Update cloudbuild.yaml : Use the --set-secrets flag in your gcloud run deploy command. This flag directly links a secret from Secret Manager to an environment variable in your Cloud Run service.
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  entrypoint: gcloud
  args:
  - 'run'
  - 'deploy'
  - 'power-choosers-crm'
  - '--image'
  - 'gcr.io/$PROJECT_ID/power-choosers-crm:$COMMIT_SHA'
  - '--region'
  - 'us-south1'
  - '--platform'
  - 'managed'
  - '--allow-unauthenticated'
  - '--port'
  - '3000'
  - '--memory'
  - '512Mi'
  - '--cpu'
  - '1'
  - '--cpu-throttling'
  - '--min-instances'
  - '0'
  - '--max-instances'
  - '10'
  - '--concurrency'
  - '40'
  # Non-sensitive variables (can still use --set-env-vars)
  - '--set-env-vars=NODE_ENV=production,LOG_LEVEL=warn,VERBOSE_LOGS=false'
  # Sensitive variables using Secret Manager
  - '--set-secrets=PERPLEXITY_API_KEY=PERPLEXITY_API_KEY:latest'
  - '--set-secrets=CRON_SECRET=CRON_SECRET:latest'
  - '--set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest'
  - '--set-secrets=FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest'
  - '--set-secrets=FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest'
  - '--set-secrets=FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest'
  - '--set-secrets=TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest'
  - '--set-secrets=TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest'
  - '--set-secrets=TWILIO_API_KEY_SID=TWILIO_API_KEY_SID:latest'
  - '--set-secrets=TWILIO_API_KEY_SECRET=TWILIO_API_KEY_SECRET:latest'
  - '--set-secrets=TWILIO_TWIML_APP_SID=TWILIO_TWIML_APP_SID:latest'
  - '--set-secrets=SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest'
  - '--set-secrets=TWILIO_PHONE_NUMBER=TWILIO_PHONE_NUMBER:latest'
  - '--set-secrets=GOOGLE_SERVICE_ACCOUNT_KEY=GOOGLE_SERVICE_ACCOUNT_KEY:latest'
  - '--set-secrets=FREE_GEMINI_KEY=FREE_GEMINI_KEY:latest'
  - '--set-secrets=OPEN_ROUTER_API_KEY=OPEN_ROUTER_API_KEY:latest'
  - '--set-secrets=APOLLO_API_KEY=APOLLO_API_KEY:latest'
  # You can combine --set-env-vars and --set-secrets in the same command
Note: While latest is convenient, for production deployments, it's often better practice to pin to a specific secret version (e.g., SECRET_NAME:1 ) to ensure deterministic deployments.
Conclusion:
The most likely cause of your error is an undefined or empty substitution variable leading to a malformed --set-env-vars string. I strongly recommend refactoring your cloudbuild.yaml to use multiple --set-env-vars flags for non-sensitive variables and, more importantly, to use Secret Manager for all your sensitive API keys and credentials. This will not only resolve your current parsing issue but also significantly improve the security posture of your deployment.

You can verify your secrets in the Google Cloud Secret Manager console: https://console.cloud.google.com/security/secret-manager