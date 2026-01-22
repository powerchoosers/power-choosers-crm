Cloud Shell Terminal Commands:
l_patterson@cloudshell:~ (power-choosers-crm)$ gcloud scheduler jobs list --location=us-central1 --project=power-choosers-crm
ID: process-activations-cron
LOCATION: us-central1
SCHEDULE (TZ): */30 8-17 * * 1-5 (America/Chicago)
TARGET_TYPE: HTTP
STATE: ENABLED

ID: generate-emails-cron
LOCATION: us-central1
SCHEDULE (TZ): */30 8-17 * * 1-5 (America/Chicago)
TARGET_TYPE: HTTP
STATE: ENABLED

ID: send-emails-cron
LOCATION: us-central1
SCHEDULE (TZ): */15 8-17 * * 1-5 (America/Chicago)
TARGET_TYPE: HTTP
STATE: ENABLED
l_patterson@cloudshell:~ (power-choosers-crm)$ gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=process-activations-cron" --limit=10 --format=json --project=power-choosers-crm
[
  {
    "insertId": "148jgmfa1kzy0",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "scheduledTime": "2025-11-11T22:30:05.511927Z",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T22:30:12.349245033Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T22:30:12.349245033Z"
  },
  {
    "httpRequest": {
      "status": 200
    },
    "insertId": "7rwtoqf1dq1yv",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished",
      "debugInfo": "URL_CRAWLED. Original HTTP response code number = 200",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T22:30:12.225564098Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T22:30:12.225564098Z"
  },
  {
    "insertId": "79axenf4jmbyp",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "scheduledTime": "2025-11-11T22:00:05.52687Z",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T22:00:11.776231181Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T22:00:11.776231181Z"
  },
  {
    "httpRequest": {
      "status": 200
    },
    "insertId": "qor16hfa3tdyn",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished",
      "debugInfo": "URL_CRAWLED. Original HTTP response code number = 200",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T22:00:11.763624979Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T22:00:11.763624979Z"
  },
  {
    "httpRequest": {
      "status": 200
    },
    "insertId": "135f6tff2nwso9",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished",
      "debugInfo": "URL_CRAWLED. Original HTTP response code number = 200",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T21:30:11.431398219Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T21:30:11.431398219Z"
  },
  {
    "insertId": "9rlovwfc7pvyt",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "scheduledTime": "2025-11-11T21:30:05.57741Z",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T21:30:11.427704946Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T21:30:11.427704946Z"
  },
  {
    "httpRequest": {
      "status": 200
    },
    "insertId": "1hlf28kf1xpawz",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished",
      "debugInfo": "URL_CRAWLED. Original HTTP response code number = 200",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T21:00:11.312880890Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T21:00:11.312880890Z"
  },
  {
    "insertId": "wifziufb3y47o",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "scheduledTime": "2025-11-11T21:00:05.028519Z",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T21:00:11.306062335Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T21:00:11.306062335Z"
  },
  {
    "insertId": "1q6bjo6f1894uv",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptStarted",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "scheduledTime": "2025-11-11T20:30:05.554582Z",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T20:30:08.470365940Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T20:30:08.470365940Z"
  },
  {
    "httpRequest": {
      "status": 200
    },
    "insertId": "3vye36etggz8",
    "jsonPayload": {
      "@type": "type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished",
      "debugInfo": "URL_CRAWLED. Original HTTP response code number = 200",
      "jobName": "projects/power-choosers-crm/locations/us-central1/jobs/process-activations-cron",
      "targetType": "HTTP",
      "url": "https://power-choosers-crm-792458658491.us-south1.run.app/api/process-sequence-activations"
    },
    "logName": "projects/power-choosers-crm/logs/cloudscheduler.googleapis.com%2Fexecutions",
    "receiveTimestamp": "2025-11-11T20:30:07.785697388Z",
    "resource": {
      "labels": {
        "job_id": "process-activations-cron",
        "location": "us-central1",
        "project_id": "power-choosers-crm"
      },
      "type": "cloud_scheduler_job"
    },
    "severity": "INFO",
    "timestamp": "2025-11-11T20:30:07.785697388Z"
  }
]
l_patterson@cloudshell:~ (power-choosers-crm)$ gcloud scheduler jobs run process-activations-cron --location=us-central1 --project=power-choosers-crm
l_patterson@cloudshell:~ (power-choosers-crm)$ gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=power-choosers-crm AND textPayload=~\"process-sequence-activations\"" --limit=20 --project=power-choosers-crm
---
insertId: 6913bf8a000579cc2d10cd67
labels:
  instanceId: 00147782962687615c4ab2ab7a3b7313bef1a77cb72aa9199508d81ded86a7e28b555e5c04c3c094b9dddd08b7774f0bbe1fe4cffde518693b529154026dd4c639c30a4ba20a65b02d138980dd
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T22:58:18.363495677Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00309-g5p
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T22:58:18.358860Z'
---
insertId: 6913b8ed0008320f9740b1a5
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T22:30:05.799021142Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T22:30:05.537103Z'
---
insertId: 6913b1e50008b1e9e0a695dc
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T22:00:05.797292053Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T22:00:05.569833Z'
---
insertId: 6913aadd00093231f7f61ccd
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T21:30:05.766179906Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T21:30:05.602673Z'
---
insertId: 6913a3d500011bdd79f2b6be
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T21:00:05.154090109Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T21:00:05.072669Z'
---
insertId: 69139ccd000923ce75add7e5
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T20:30:05.785575499Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T20:30:05.598990Z'
---
insertId: 691395c50008fd8575fc9b1d
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T20:00:05.884783998Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T20:00:05.589189Z'
---
insertId: 69138ebd000ad8c95edf444d
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T19:30:05.958926774Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T19:30:05.710857Z'
---
insertId: 691387b500088c33e13bfb8f
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T19:00:05.879850715Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T19:00:05.560179Z'
---
insertId: 691380ad000a467e8462098a
labels:
  instanceId: 0014778296452a369b4cad458e512525368a704f26a12e1cbdea1d8c896af534aff81e8ddb356ea71a6f7624b1fcc0a2d529f694bc89950fdb8f988a16d9ca265727e57b7bc1b246fe57f0f247
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T18:30:05.950265235Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00306-d64
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T18:30:05.673406Z'
---
insertId: 691379a5000876b6faada5a9
labels:
  instanceId: 0014778296452a369b4cad458e512525368a704f26a12e1cbdea1d8c896af534aff81e8ddb356ea71a6f7624b1fcc0a2d529f694bc89950fdb8f988a16d9ca265727e57b7bc1b246fe57f0f247
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T18:00:05.822632058Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00306-d64
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T18:00:05.554678Z'
---
insertId: 6913729e00082e04670cc4b4
labels:
  instanceId: 0014778296452a369b4cad458e512525368a704f26a12e1cbdea1d8c896af534aff81e8ddb356ea71a6f7624b1fcc0a2d529f694bc89950fdb8f988a16d9ca265727e57b7bc1b246fe57f0f247
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T17:30:06.860167213Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00306-d64
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T17:30:06.536068Z'
---
insertId: 69136b95000a0b5f202cc17e
labels:
  instanceId: 0014778296452a369b4cad458e512525368a704f26a12e1cbdea1d8c896af534aff81e8ddb356ea71a6f7624b1fcc0a2d529f694bc89950fdb8f988a16d9ca265727e57b7bc1b246fe57f0f247
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T17:00:05.747576029Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00306-d64
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T17:00:05.658271Z'
---
insertId: 6913648c000efde37d88cb11
labels:
  instanceId: 0014778296b23ebabb69a46c1262741f7f7db439f1498b86501eacc41d41853d794094ac5e0824b031ee53315fcaaad67eeb375f8476a0fc645d7bb12c3d6b1bd81712a2b5d4caccc8438dcb63
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T16:30:05.146322823Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00305-fg2
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T16:30:04.982499Z'
---
insertId: 69135d850007a181056891bb
labels:
  instanceId: 0014778296b23ebabb69a46c1262741f7f7db439f1498b86501eacc41d41853d794094ac5e0824b031ee53315fcaaad67eeb375f8476a0fc645d7bb12c3d6b1bd81712a2b5d4caccc8438dcb63
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T16:00:05.609201866Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00305-fg2
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T16:00:05.500097Z'
---
insertId: 6913567d000b302ec0d6a6b1
labels:
  instanceId: 001477829642b1c57097644a263d40b8a7328fc927823df357c11bc374ce45ddb680502c0d7506d1644418f920045fd1d198dbf1bb1277ca30f075ba7ce787a4d9fa0ee845e92baba5b9ec4b41
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T15:30:05.876302946Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00303-8pq
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T15:30:05.733230Z'
---
insertId: 69134f7500080b6e7405dbdd
labels:
  instanceId: 001477829642b1c57097644a263d40b8a7328fc927823df357c11bc374ce45ddb680502c0d7506d1644418f920045fd1d198dbf1bb1277ca30f075ba7ce787a4d9fa0ee845e92baba5b9ec4b41
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T15:00:05.797547990Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00303-8pq
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T15:00:05.527214Z'
---
insertId: 6913486d00083d4567d679b3
labels:
  instanceId: 001477829642b1c57097644a263d40b8a7328fc927823df357c11bc374ce45ddb680502c0d7506d1644418f920045fd1d198dbf1bb1277ca30f075ba7ce787a4d9fa0ee845e92baba5b9ec4b41
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T14:30:05.596823490Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00303-8pq
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T14:30:05.539973Z'
---
insertId: 6913416800031d37135c2cbc
labels:
  instanceId: 001477829642b1c57097644a263d40b8a7328fc927823df357c11bc374ce45ddb680502c0d7506d1644418f920045fd1d198dbf1bb1277ca30f075ba7ce787a4d9fa0ee845e92baba5b9ec4b41
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T14:00:08.251041302Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00303-8pq
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] Unspecified or unknown Content-Type:  for URL: /api/process-sequence-activations
  - attempting form-urlencoded parse'
timestamp: '2025-11-11T14:00:08.204087Z'
---
insertId: 691282d7000cbb927e1434f6
labels:
  instanceId: 00147782960991a1baf262c6d858ab236aa739cf9b2a72b2f30272b9f90385a6a37885371bda67da7f461bb5c529e619a9108b18c2956fa5994dbeb4a8138feebc0d105338b0591a0cc7f40a44
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Fstderr
receiveTimestamp: '2025-11-11T00:27:03.841306679Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00297-7xv
    service_name: power-choosers-crm
  type: cloud_run_revision
textPayload: '[Server] File not found at constructed path: /app/api/process-sequence-activations'
timestamp: '2025-11-11T00:27:03.834450Z'
l_patterson@cloudshell:~ (power-choosers-crm)$ gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=power-choosers-crm AND severity>=ERROR" --limit=20 --project=power-choosers-crm
---
httpRequest:
  latency: 299.999177912s
  protocol: HTTP/1.1
  remoteIp: 54.174.71.60
  requestMethod: GET
  requestSize: '816'
  requestUrl: https://power-choosers-crm-792458658491.us-south1.run.app/api/track-email-performance
  responseSize: '72'
  serverIp: 34.143.75.2
  status: 504
  userAgent: Mozilla/5.0 (compatible; proximic; +https://www.comscore.com/Web-Crawler)
insertId: 6913b546000a05456e155252
labels:
  instanceId: 001477829643ff15edfa1906b48c721dc80d27e7a0c63f29b3e02d149dc79488454a982246322cd94e7f7e34474585c6170a07d5c61e58831f24d2779566df0b95609d0e0f1d339c7532ae4674
logName: projects/power-choosers-crm/logs/run.googleapis.com%2Frequests
receiveTimestamp: '2025-11-11T22:14:30.661867202Z'
resource:
  labels:
    configuration_name: power-choosers-crm
    location: us-south1
    project_id: power-choosers-crm
    revision_name: power-choosers-crm-00308-r6k
    service_name: power-choosers-crm
  type: cloud_run_revision
severity: ERROR
spanId: f6af70f1a2741f2b
timestamp: '2025-11-11T22:09:30.656266Z'
trace: projects/power-choosers-crm/traces/b5da7c890fc0195cdfc4fce74d6726fe
traceSampled: true
---
insertId: i2m4lzd7hnt
logName: projects/power-choosers-crm/logs/cloudaudit.googleapis.com%2Factivity
protoPayload:
  '@type': type.googleapis.com/google.cloud.audit.AuditLog
  authenticationInfo:
    oauthInfo:
      oauthClientId: '112218251775381275624'
    principalEmail: 792458658491-compute@developer.gserviceaccount.com
    principalSubject: serviceAccount:792458658491-compute@developer.gserviceaccount.com
  authorizationInfo:
  - granted: true
    permission: run.services.update
    permissionType: ADMIN_WRITE
    resource: namespaces/power-choosers-crm/services/power-choosers-crm
    resourceAttributes: {}
  methodName: google.cloud.run.v1.Services.ReplaceService
  request:
    '@type': type.googleapis.com/google.cloud.run.v1.ReplaceServiceRequest
    name: namespaces/power-choosers-crm/services/power-choosers-crm
    service:
      apiVersion: serving.knative.dev/v1
      kind: Service
      metadata:
        annotations:
          run.googleapis.com/client-name: gcloud
          run.googleapis.com/client-version: 546.0.0
          run.googleapis.com/ingress: all
          run.googleapis.com/ingress-status: all
          run.googleapis.com/invoker-iam-disabled: 'true'
          run.googleapis.com/maxScale: '10'
          run.googleapis.com/operation-id: 8e00f57b-35ea-487c-89fe-dda31b26a1d1
          run.googleapis.com/urls: '["https://power-choosers-crm-792458658491.us-south1.run.app","https://power-choosers-crm-g6vobnfloq-vp.a.run.app"]'
          serving.knative.dev/creator: l.patterson@powerchoosers.com
          serving.knative.dev/lastModifier: 792458658491-compute@developer.gserviceaccount.com
        creationTimestamp: '2025-10-20T19:06:39.998490Z'
        generation: 298
        labels:
          cloud.googleapis.com/location: us-south1
          gcb-trigger-id: 59a604ce-59e6-4f5b-b781-2f628237f774
          gcb-trigger-region: global
          managed-by: gcp-cloud-build-deploy-cloud-run
        name: power-choosers-crm
        namespace: '792458658491'
        resourceVersion: AAZDRgUpJQM
        selfLink: /apis/serving.knative.dev/v1/namespaces/792458658491/services/power-choosers-crm
        uid: 2c625817-a516-4ffd-bc60-a0e37bd8d93c
      spec:
        template:
          metadata:
            annotations:
              autoscaling.knative.dev/maxScale: '10'
              run.googleapis.com/client-name: gcloud
              run.googleapis.com/client-version: 546.0.0
              run.googleapis.com/cpu-throttling: 'False'
              run.googleapis.com/execution-environment: gen1
              run.googleapis.com/startup-cpu-boost: 'true'
            labels:
              client.knative.dev/nonce: quuvdotjbt
              run.googleapis.com/startupProbeType: Default
          spec:
            containerConcurrency: 40
            containers:
            - image: gcr.io/power-choosers-crm/power-choosers-crm:adf44bbf9bff2e8b9af6a9891c235622eada20fe
              name: placeholder-1
              resources:
                limits:
                  cpu: '1'
                  memory: 512MB
            serviceAccountName: 792458658491-compute@developer.gserviceaccount.com
            timeoutSeconds: 300
        traffic:
        - latestRevision: true
          percent: 100
      status:
        conditions:
        - lastTransitionTime: '2025-11-10T23:37:53.618179Z'
          status: 'True'
          type: Ready
        - lastTransitionTime: '2025-11-10T23:37:44.002125Z'
          status: 'True'
          type: ConfigurationsReady
        - lastTransitionTime: '2025-11-10T23:37:53.582230Z'
          status: 'True'
          type: RoutesReady
        latestCreatedRevisionName: power-choosers-crm-00297-7xv
        latestReadyRevisionName: power-choosers-crm-00297-7xv
        observedGeneration: 298
        traffic:
        - latestRevision: true
          percent: 100
          revisionName: power-choosers-crm-00297-7xv
        url: https://power-choosers-crm-g6vobnfloq-vp.a.run.app
  requestMetadata:
    callerIp: 34.168.102.47
    callerSuppliedUserAgent: google-cloud-sdk gcloud/546.0.0 command/gcloud.run.deploy
      invocation-id/16ef023f5af143da908bb92fea496bb3 environment/GCE environment-version/None
      client-os/LINUX client-os-ver/5.10.0 client-pltf-arch/x86_64 interactive/False
      from-script/False python/3.13.7 term/  (Linux 5.10.0-32-cloud-amd64),gzip(gfe)
    destinationAttributes: {}
    requestAttributes:
      auth: {}
      time: '2025-11-10T23:38:10.709661Z'
  resourceLocation:
    currentLocations:
    - us-south1
  resourceName: namespaces/power-choosers-crm/services/power-choosers-crm
  serviceName: run.googleapis.com
  status:
    code: 3
    message: 'spec.template.spec.containers[0].resources.limits.memory: could not
      match suffix MB while parsing Quantity. Allowed values are [m, k, M, G, T, Ki,
      Mi, Gi, Ti, Pi, Ei]'
receiveTimestamp: '2025-11-10T23:38:11.484276697Z'
resource:
  labels:
    configuration_name: ''
    location: us-south1
    project_id: power-choosers-crm
    revision_name: ''
    service_name: power-choosers-crm
  type: cloud_run_revision
severity: ERROR
timestamp: '2025-11-10T23:38:10.457661Z'
l_patterson@cloudshell:~ (power-choosers-crm)$ 