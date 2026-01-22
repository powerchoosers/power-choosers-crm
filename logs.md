DEFAULT 2025-12-28T03:43:58.325234Z [Apollo API] Using API key: b0qM...O2BQ (length: 22 chars)
  {
    "textPayload": "[Apollo API] Using API key: b0qM...O2BQ (length: 22 chars)",
    "insertId": "6950a77e0004f672419225ec",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "configuration_name": "power-choosers-crm",
        "revision_name": "power-choosers-crm-00863-4sh",
        "project_id": "power-choosers-crm",
        "service_name": "power-choosers-crm",
        "location": "us-south1"
      }
    },
    "timestamp": "2025-12-28T03:43:58.325234Z",
    "labels": {
      "instanceId": "0007e26d68f946634c2fd121d93c11fb44c1f20c86d65407ec0113d0fb80cf7d54f57c97fd2ce4acf3416031b66e24de2a7f5d3115ca8c3a5a8a521c3eeeac39e2896711f0b56a71f80cd43eeb20"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstdout",
    "receiveTimestamp": "2025-12-28T03:43:58.614109046Z"
  }
DEFAULT 2025-12-28T03:43:58.325477Z [Apollo Enrich] 📞 Phone reveals enabled with webhook (query): https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-webhook
  {
    "textPayload": "[Apollo Enrich] 📞 Phone reveals enabled with webhook (query): https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-webhook",
    "insertId": "6950a77e0004f7655f4d80b4",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "configuration_name": "power-choosers-crm",
        "project_id": "power-choosers-crm",
        "revision_name": "power-choosers-crm-00863-4sh",
        "location": "us-south1",
        "service_name": "power-choosers-crm"
      }
    },
    "timestamp": "2025-12-28T03:43:58.325477Z",
    "labels": {
      "instanceId": "0007e26d68f946634c2fd121d93c11fb44c1f20c86d65407ec0113d0fb80cf7d54f57c97fd2ce4acf3416031b66e24de2a7f5d3115ca8c3a5a8a521c3eeeac39e2896711f0b56a71f80cd43eeb20"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstdout",
    "receiveTimestamp": "2025-12-28T03:43:58.614109046Z"
  }
DEFAULT 2025-12-28T03:43:58.325517Z [Apollo Enrich] Using Apollo ID strategy for: 5eaf095a2d1d1f0001eeef23
DEFAULT 2025-12-28T03:43:58.325591Z [Apollo Enrich] Match request: {
DEFAULT 2025-12-28T03:43:58.325600Z "reveal_personal_emails": false,
DEFAULT 2025-12-28T03:43:58.325603Z "reveal_phone_number": true,
DEFAULT 2025-12-28T03:43:58.325607Z "id": "5eaf095a2d1d1f0001eeef23"
DEFAULT 2025-12-28T03:43:58.325610Z }
DEFAULT 2025-12-28T03:43:58.709121Z [Apollo Enrich] Response for 5eaf095a2d1d1f0001eeef23 - person found: true
DEFAULT 2025-12-28T03:43:58.709412Z [Apollo Enrich] Saving to contacts: tjanish@alphatesting.com
DEFAULT 2025-12-28T03:43:59.307775Z [Apollo Enrich] Successfully saved to contacts - future enrichments FREE!
DEFAULT 2025-12-28T03:43:59.308094Z [Apollo Enrich] Final response: 1 contacts enriched
  {
    "textPayload": "[Apollo Enrich] Final response: 1 contacts enriched",
    "insertId": "6950a77f0004b37e039ff34b",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "revision_name": "power-choosers-crm-00863-4sh",
        "configuration_name": "power-choosers-crm",
        "service_name": "power-choosers-crm",
        "project_id": "power-choosers-crm",
        "location": "us-south1"
      }
    },
    "timestamp": "2025-12-28T03:43:59.308094Z",
    "labels": {
      "instanceId": "0007e26d68f946634c2fd121d93c11fb44c1f20c86d65407ec0113d0fb80cf7d54f57c97fd2ce4acf3416031b66e24de2a7f5d3115ca8c3a5a8a521c3eeeac39e2896711f0b56a71f80cd43eeb20"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstdout",
    "receiveTimestamp": "2025-12-28T03:43:59.611915319Z"
  }


INFO 2025-12-28T03:45:48.581653Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 448 B] [httpRequest.latency: 76 ms] [httpRequest.userAgent: Mechanize/2.8.1 Ruby/3.3.1p55 (http://github.com/sparklemotion/mechanize/)] https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-webhook
DEFAULT 2025-12-28T03:45:48.582324Z [Apollo Phone Webhook] 📞 Received webhook request
  {
    "textPayload": "[Apollo Phone Webhook] 📞 Received webhook request",
    "insertId": "6950a7ec0008e2b40811fba1",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "configuration_name": "power-choosers-crm",
        "project_id": "power-choosers-crm",
        "revision_name": "power-choosers-crm-00863-4sh",
        "service_name": "power-choosers-crm",
        "location": "us-south1"
      }
    },
    "timestamp": "2025-12-28T03:45:48.582324Z",
    "labels": {
      "instanceId": "0007e26d68f946634c2fd121d93c11fb44c1f20c86d65407ec0113d0fb80cf7d54f57c97fd2ce4acf3416031b66e24de2a7f5d3115ca8c3a5a8a521c3eeeac39e2896711f0b56a71f80cd43eeb20"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstdout",
    "receiveTimestamp": "2025-12-28T03:45:48.588835792Z"
  }
DEFAULT 2025-12-28T03:45:48.582555Z [Apollo Phone Webhook] ℹ️ Payload contains "people" array.
  {
    "textPayload": "[Apollo Phone Webhook] ℹ️ Payload contains \"people\" array.",
    "insertId": "6950a7ec0008e39b9006d303",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "project_id": "power-choosers-crm",
        "configuration_name": "power-choosers-crm",
        "revision_name": "power-choosers-crm-00863-4sh",
        "service_name": "power-choosers-crm",
        "location": "us-south1"
      }
    },
    "timestamp": "2025-12-28T03:45:48.582555Z",
    "labels": {
      "instanceId": "0007e26d68f946634c2fd121d93c11fb44c1f20c86d65407ec0113d0fb80cf7d54f57c97fd2ce4acf3416031b66e24de2a7f5d3115ca8c3a5a8a521c3eeeac39e2896711f0b56a71f80cd43eeb20"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstdout",
    "receiveTimestamp": "2025-12-28T03:45:48.588835792Z"
  }
DEFAULT 2025-12-28T03:45:48.582627Z [Apollo Phone Webhook] ✅ Received 2 phone(s) for person: 5eaf095a2d1d1f0001eeef23
  {
    "textPayload": "[Apollo Phone Webhook] ✅ Received 2 phone(s) for person: 5eaf095a2d1d1f0001eeef23",
    "insertId": "6950a7ec0008e3e3c767d788",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "revision_name": "power-choosers-crm-00863-4sh",
        "project_id": "power-choosers-crm",
        "configuration_name": "power-choosers-crm",
        "location": "us-south1",
        "service_name": "power-choosers-crm"
      }
    },
    "timestamp": "2025-12-28T03:45:48.582627Z",
    "labels": {
      "instanceId": "0007e26d68f946634c2fd121d93c11fb44c1f20c86d65407ec0113d0fb80cf7d54f57c97fd2ce4acf3416031b66e24de2a7f5d3115ca8c3a5a8a521c3eeeac39e2896711f0b56a71f80cd43eeb20"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstdout",
    "receiveTimestamp": "2025-12-28T03:45:48.921487946Z"
  }
DEFAULT 2025-12-28T03:45:48.592893Z [Apollo Phone Webhook] 📞 Received webhook request
  {
    "textPayload": "[Apollo Phone Webhook] 📞 Received webhook request",
    "insertId": "6950a7ec00090bfd1aa93bf3",
    "resource": {
      "type": "cloud_run_revision",
      "labels": {
        "location": "us-south1",
        "revision_name": "power-choosers-crm-00863-4sh",
        "configuration_name": "power-choosers-crm",
        "project_id": "power-choosers-crm",
        "service_name": "power-choosers-crm"
      }
    },
    "timestamp": "2025-12-28T03:45:48.592893Z",
    "labels": {
      "instanceId": "0007e26d68f946634c2fd121d93c11fb44c1f20c86d65407ec0113d0fb80cf7d54f57c97fd2ce4acf3416031b66e24de2a7f5d3115ca8c3a5a8a521c3eeeac39e2896711f0b56a71f80cd43eeb20"
    },
    "logName": "projects/power-choosers-crm/logs/run.googleapis.com%2Fstdout",
    "receiveTimestamp": "2025-12-28T03:45:48.921487946Z"
  }
DEFAULT 2025-12-28T03:45:48.593114Z [Apollo Phone Webhook] ℹ️ Payload contains "people" array.
DEFAULT 2025-12-28T03:45:48.593218Z [Apollo Phone Webhook] ✅ Received 1 phone(s) for person: 668713932e3ebd000150d884
DEFAULT 2025-12-28T03:45:48.654559Z [Apollo Phone Webhook] ✓ Saved to Firestore: 5eaf095a2d1d1f0001eeef23
DEFAULT 2025-12-28T03:45:48.657948Z [Apollo Phone Webhook] ✓ Saved to Firestore: 668713932e3ebd000150d884
INFO 2025-12-28T03:46:11.033477Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 3 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.200677Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.259672Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 3 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.284413Z [httpRequest.requestMethod: OPTIONS] [httpRequest.status: 204] [httpRequest.responseSize: 364 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/calls/account/gHf6omp8U7y0ibcWrBNC?limit=20
INFO 2025-12-28T03:46:11.286368Z [httpRequest.requestMethod: GET] [httpRequest.status: 200] [httpRequest.responseSize: 1.09 KiB] [httpRequest.latency: 70 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-retrieve?personId=5eaf095a2d1d1f0001eeef23
DEFAULT 2025-12-28T03:46:11.288366Z [Apollo Phone Retrieve] 🔍 Checking for phones for person: 5eaf095a2d1d1f0001eeef23
INFO 2025-12-28T03:46:11.289037Z [httpRequest.requestMethod: GET] [httpRequest.status: 200] [httpRequest.responseSize: 743 B] [httpRequest.latency: 58 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-retrieve?personId=668713932e3ebd000150d884
DEFAULT 2025-12-28T03:46:11.294518Z [Apollo Phone Retrieve] 🔍 Checking for phones for person: 668713932e3ebd000150d884
INFO 2025-12-28T03:46:11.337278Z [httpRequest.requestMethod: GET] [httpRequest.status: 200] [httpRequest.responseSize: 477 B] [httpRequest.latency: 487 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/calls/account/gHf6omp8U7y0ibcWrBNC?limit=20
DEFAULT 2025-12-28T03:46:11.346873Z [Apollo Phone Retrieve] ✅ Found data for person: 668713932e3ebd000150d884
DEFAULT 2025-12-28T03:46:11.356330Z [Apollo Phone Retrieve] ✅ Found data for person: 5eaf095a2d1d1f0001eeef23
INFO 2025-12-28T03:46:11.362451Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.431316Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 3 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.437630Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.443860Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 8 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.446845Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 6 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:11.940177Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:12.107975Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:12.113914Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 1 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:12.253087Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:12.327031Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:12.345689Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:13.375792Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:13.381149Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:13.388969Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:20.293135Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:21.441145Z [httpRequest.requestMethod: GET] [httpRequest.status: 200] [httpRequest.responseSize: 743 B] [httpRequest.latency: 50 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-retrieve?personId=668713932e3ebd000150d884
INFO 2025-12-28T03:46:21.441209Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 3 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
DEFAULT 2025-12-28T03:46:21.444934Z [Apollo Phone Retrieve] 🔍 Checking for phones for person: 668713932e3ebd000150d884
INFO 2025-12-28T03:46:21.446286Z [httpRequest.requestMethod: GET] [httpRequest.status: 200] [httpRequest.responseSize: 1.09 KiB] [httpRequest.latency: 58 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-retrieve?personId=5eaf095a2d1d1f0001eeef23
INFO 2025-12-28T03:46:21.448431Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 4 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
DEFAULT 2025-12-28T03:46:21.449180Z [Apollo Phone Retrieve] 🔍 Checking for phones for person: 5eaf095a2d1d1f0001eeef23
DEFAULT 2025-12-28T03:46:21.492302Z [Apollo Phone Retrieve] ✅ Found data for person: 668713932e3ebd000150d884
DEFAULT 2025-12-28T03:46:21.505058Z [Apollo Phone Retrieve] ✅ Found data for person: 5eaf095a2d1d1f0001eeef23
INFO 2025-12-28T03:46:21.538658Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:21.539294Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:21.539905Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:21.545505Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
INFO 2025-12-28T03:46:31.935584Z [httpRequest.requestMethod: GET] [httpRequest.status: 200] [httpRequest.responseSize: 1.09 KiB] [httpRequest.latency: 42 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-retrieve?personId=5eaf095a2d1d1f0001eeef23
INFO 2025-12-28T03:46:31.936205Z [httpRequest.requestMethod: GET] [httpRequest.status: 200] [httpRequest.responseSize: 743 B] [httpRequest.latency: 50 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://power-choosers-crm-792458658491.us-south1.run.app/api/apollo/phone-retrieve?personId=668713932e3ebd000150d884
INFO 2025-12-28T03:46:31.938109Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 3 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
DEFAULT 2025-12-28T03:46:31.938672Z [Apollo Phone Retrieve] 🔍 Checking for phones for person: 5eaf095a2d1d1f0001eeef23
INFO 2025-12-28T03:46:31.939460Z [httpRequest.requestMethod: POST] [httpRequest.status: 200] [httpRequest.responseSize: 419 B] [httpRequest.latency: 2 ms] [httpRequest.userAgent: Chrome 143.0.0.0] https://powerchoosers.com/api/debug/log
DEFAULT 2025-12-28T03:46:31.939801Z [Apollo Phone Retrieve] 🔍 Checking for phones for person: 668713932e3ebd000150d884
DEFAULT 2025-12-28T03:46:31.978458Z [Apollo Phone Retrieve] ✅ Found data for person: 5eaf095a2d1d1f0001eeef23
DEFAULT 2025-12-28T03:46:31.986912Z [Apollo Phone Retrieve] ✅ Found data for person: 668713932e3ebd000150d884
