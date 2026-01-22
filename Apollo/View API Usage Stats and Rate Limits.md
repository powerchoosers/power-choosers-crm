View API Usage Stats and Rate Limits
post
https://api.apollo.io/api/v1/usage_stats/api_usage_stats
Use the View API Usage Stats endpoint to view your team's usage of Apollo's APIs and your rate limit for API endpoints.

Each endpoint has a rate limit per minute, hour, and day. Your Apollo pricing plan does impact the rate limits for API endpoints.

This endpoint requires a master API key. If you attempt to call the endpoint without a master key, you will receive a 403 response. Refer to Create API Keys to learn how to create a master API key.

Responses

200

401
Unauthorized


403
Forbidden

Fetch Request:
const url = 'https://api.apollo.io/api/v1/usage_stats/api_usage_stats';
const options = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json'
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));


Response:
{
  "[\"api/v1/contacts\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 500,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 5,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 10,
      "left_over": 200
    }
  },
  "[\"api/v1/contacts\", \"intelligent_fuzzy_search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/contacts\", \"create\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/contacts\", \"update\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/contacts\", \"match\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/contacts\", \"bulk_match\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 100,
      "consumed": 0,
      "left_over": 100
    },
    "minute": {
      "limit": 20,
      "consumed": 0,
      "left_over": 20
    }
  },
  "[\"api/v1/contact_stages\", \"index\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/accounts\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/account_stages\", \"index\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/people\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/people\", \"match\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/people\", \"bulk_match\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 100,
      "consumed": 0,
      "left_over": 100
    },
    "minute": {
      "limit": 20,
      "consumed": 0,
      "left_over": 20
    }
  },
  "[\"api/v1/people\", \"show\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/organizations\", \"show\"]": {
    "day": {
      "limit": 6000,
      "consumed": 3,
      "left_over": 5997
    },
    "hour": {
      "limit": 600,
      "consumed": 3,
      "left_over": 597
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/organizations\", \"show_with_context\"]": {
    "day": {
      "limit": 6000,
      "consumed": 3,
      "left_over": 5997
    },
    "hour": {
      "limit": 600,
      "consumed": 3,
      "left_over": 597
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/organizations\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/organizations\", \"enrich\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/organizations\", \"bulk_enrich\"]": {
    "day": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "hour": {
      "limit": 100,
      "consumed": 0,
      "left_over": 100
    },
    "minute": {
      "limit": 20,
      "consumed": 0,
      "left_over": 20
    }
  },
  "[\"api/v1/organizations\", \"job_postings\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/organizations\", \"employee_metrics\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/mixed_companies\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/mixed_people\", \"add_to_my_prospects\"]": {
    "day": {
      "limit": 6000,
      "consumed": 1,
      "left_over": 5999
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 100,
      "consumed": 0,
      "left_over": 100
    }
  },
  "[\"api/v1/mixed_people\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 10,
      "left_over": 5990
    },
    "hour": {
      "limit": 600,
      "consumed": 10,
      "left_over": 590
    },
    "minute": {
      "limit": 200,
      "consumed": 1,
      "left_over": 199
    }
  },
  "[\"api/v1/mixed_people\", \"organization_top_people\"]": {
    "day": {
      "limit": 2000,
      "consumed": 0,
      "left_over": 2000
    },
    "hour": {
      "limit": 400,
      "consumed": 0,
      "left_over": 400
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/conversation_shares\", \"create\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/conversation_shares\", \"update\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/conversation_shares\", \"show\"]": {
    "day": {
      "limit": 300,
      "consumed": 0,
      "left_over": 300
    },
    "hour": {
      "limit": 50,
      "consumed": 0,
      "left_over": 50
    },
    "minute": {
      "limit": 10,
      "consumed": 0,
      "left_over": 10
    }
  },
  "[\"api/v1/conversation_shares\", \"external\"]": {
    "day": {
      "limit": 300,
      "consumed": 0,
      "left_over": 300
    },
    "hour": {
      "limit": 50,
      "consumed": 0,
      "left_over": 50
    },
    "minute": {
      "limit": 10,
      "consumed": 0,
      "left_over": 10
    }
  },
  "[\"api/v1/conversations\", \"ask_anything_v2_chat\"]": {
    "day": {
      "limit": 1000,
      "consumed": 0,
      "left_over": 1000
    },
    "hour": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    },
    "minute": {
      "limit": 20,
      "consumed": 0,
      "left_over": 20
    }
  },
  "[\"api/v1/conversations\", \"export\"]": {
    "day": {
      "limit": 480,
      "consumed": 0,
      "left_over": 480
    },
    "hour": {
      "limit": 20,
      "consumed": 0,
      "left_over": 20
    },
    "minute": {
      "limit": 1,
      "consumed": 0,
      "left_over": 1
    }
  },
  "[\"api/v1/voice_settings\", \"get_available_phone_numbers\"]": {
    "day": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    },
    "hour": {
      "limit": 50,
      "consumed": 0,
      "left_over": 50
    },
    "minute": {
      "limit": 10,
      "consumed": 0,
      "left_over": 10
    }
  },
  "[\"api/v1/tasks\", \"create\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/tasks\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 3,
      "left_over": 5997
    },
    "hour": {
      "limit": 600,
      "consumed": 3,
      "left_over": 597
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/tasks\", \"bulk_complete\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/reports\", \"sync_report\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 5,
      "consumed": 0,
      "left_over": 5
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/mfa_config\", \"create\"]": {
    "day": {
      "limit": 50,
      "consumed": 0,
      "left_over": 50
    },
    "hour": {
      "limit": 20,
      "consumed": 0,
      "left_over": 20
    },
    "minute": {
      "limit": 5,
      "consumed": 0,
      "left_over": 5
    }
  },
  "[\"api/v1/phone_calls\", \"create\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/phone_calls\", \"update\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/paging_events\", \"create\"]": {
    "day": {
      "limit": 6000,
      "consumed": 3,
      "left_over": 5997
    },
    "hour": {
      "limit": 600,
      "consumed": 1,
      "left_over": 599
    },
    "minute": {
      "limit": 200,
      "consumed": 1,
      "left_over": 199
    }
  },
  "[\"api/v1/crm\", \"object_fields_mapping\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/emailer_campaigns\", \"show\"]": {
    "day": {
      "limit": 6000,
      "consumed": 2,
      "left_over": 5998
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/emailer_campaigns\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 2,
      "left_over": 5998
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/emailer_campaigns\", \"add_contact_ids\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/emailer_campaigns\", \"remove_or_stop_contact_ids\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/emailer_messages\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/emailer_messages\", \"activities\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/users\", \"search\"]": {
    "day": {
      "limit": 6000,
      "consumed": 4,
      "left_over": 5996
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/email_accounts\", \"index\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/labels\", \"index\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  },
  "[\"api/v1/typed_custom_fields\", \"index\"]": {
    "day": {
      "limit": 6000,
      "consumed": 0,
      "left_over": 6000
    },
    "hour": {
      "limit": 600,
      "consumed": 0,
      "left_over": 600
    },
    "minute": {
      "limit": 200,
      "consumed": 0,
      "left_over": 200
    }
  }
0










