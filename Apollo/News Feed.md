News Articles Search

# News Articles Search

Use the News Articles Search endpoint to find news articles related to companies in the Apollo database. Several filters are available to help narrow your search. <br><br>Calling this endpoint does consume credits as part of your <a href="https://docs.apollo.io/docs/api-pricing" target="_blank">Apollo pricing plan</a>.

# OpenAPI definition

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "apollo-rest-api",
    "version": "1.0"
  },
  "servers": [
    {
      "url": "https://api.apollo.io/api/v1"
    }
  ],
  "components": {
    "securitySchemes": {
      "apiKey": {
        "type": "apiKey",
        "in": "header",
        "name": "x-api-key",
        "description": "API key"
      },
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "[Recommended] OAuth Access token"
      }
    }
  },
  "security": [
    {
      "bearerAuth": []
    },
    {
      "apiKey": []
    }
  ],
  "paths": {
    "/news_articles/search": {
      "post": {
        "description": "",
        "operationId": "news_articles_search",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "examples": {
                  "OK": {
                    "summary": "OK",
                    "value": {
                      "pagination": {
                        "page": 1,
                        "per_page": 25,
                        "total_entries": 10,
                        "total_pages": 1
                      },
                      "news_articles": [
                        {
                          "id": "6815925ac310740011aba570",
                          "url": "https://techintelpro.com/news/apolloio-appoints-marcio-arnecke-as-cmo-and-adam-carr-as-cro-to-accelerate-ai-powered-go-to-market-innovation",
                          "domain": "techintelpro.com",
                          "title": "Apollo.io Appoints Marcio Arnecke as CMO and Adam Carr as CRO to Accelerate AI-Powered Go-to-Market Innovation",
                          "snippet": "Apollo.io, a leading AI-powered go-to-market sales platform, today announced the appointments of Marcio Arnecke as Chief Marketing Officer (CMO) and Adam Carr as Chief Revenue Officer (CRO).",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2025-05-02T00:00:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "681592d92d7b13001977c6df",
                          "url": "https://techintelpro.com/news/apolloio-appoints-marcio-arnecke-as-cmo-and-adam-carr-as-cro-to-accelerate-ai-powered-go-to-market-innovation",
                          "domain": "techintelpro.com",
                          "title": "Apollo.io Appoints Marcio Arnecke as CMO and Adam Carr as CRO to Accelerate AI-Powered Go-to-Market Innovation",
                          "snippet": "Apollo.io, a leading AI-powered go-to-market sales platform, today announced the appointments of Marcio Arnecke as Chief Marketing Officer (CMO) and Adam Carr as Chief Revenue Officer (CRO).",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2025-05-02T00:00:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "668961e815876f040da3b685",
                          "url": "https://www.prnewswire.com/news-releases/meet-the-new-faces-driving-apollos-gtm-evolution-matt-curl-as-coo-and-rich-bessel-as-svp-of-design-302187696.html",
                          "domain": "prnewswire.com",
                          "title": "Meet the New Faces Driving Apollo's GTM Evolution: Matt Curl as COO and Rich Bessel as SVP of Design",
                          "snippet": "SAN FRANCISCO, July 2, 2024 /PRNewswire/ - Apollo.io, a leading go-to-market (GTM) solution for sales and marketing teams, has appointed two new executives to its leadership team: Matt Curl as Chief Operating Officer (COO) and Rich Bessel as SVP of Design.",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2024-07-02T12:00:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "668962016fbe79040e1c0490",
                          "url": "https://www.prnewswire.com/news-releases/meet-the-new-faces-driving-apollos-gtm-evolution-matt-curl-as-coo-and-rich-bessel-as-svp-of-design-302187696.html",
                          "domain": "prnewswire.com",
                          "title": "Meet the New Faces Driving Apollo's GTM Evolution: Matt Curl as COO and Rich Bessel as SVP of Design",
                          "snippet": "SAN FRANCISCO, July 2, 2024 /PRNewswire/ - Apollo.io, a leading go-to-market (GTM) solution for sales and marketing teams, has appointed two new executives to its leadership team: Matt Curl as Chief Operating Officer (COO) and Rich Bessel as SVP of Design.",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2024-07-02T12:00:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "64c0037589653e00a34746c7",
                          "url": "https://www.prnewswire.com/news-releases/leandra-fishman-joins-apolloio-as-chief-revenue-officer-fueling-revenue-growth-and-product-innovation-301884666.html",
                          "domain": "prnewswire.com",
                          "title": "Leandra Fishman joins Apollo.io as Chief Revenue officer, fueling Revenue growth and Product innovation",
                          "snippet": "Apollo.io, the leading go-to-market sales platform, today announced the appointment of Leandra Fishman to its executive team as the company's first Chief Revenue Officer (CRO).",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2023-07-25T11:00:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "63e68163e3288200a36b69c8",
                          "url": "https://finance.yahoo.com/news/apollo-io-announces-shek-viswanathan-152200939.html",
                          "domain": "yahoo.com",
                          "title": "Apollo.io Announces Shek Viswanathan as Chief Product Officer Amidst Record January Revenue Numbers and Expanded Product Vision",
                          "snippet": "Today, Apollo.io, the world's leading B2B sales intelligence and engagement platform, announces the appointment of Shek Viswanathan as their Chief Product Officer.",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2023-02-08T15:22:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "61815864ad796300e07c74f7",
                          "url": "https://www.finsmes.com/2021/11/apollo-io-raises-32m-in-series-b-funding.html",
                          "domain": "finsmes.com",
                          "title": "Apollo.io Raises $32M in Series B Funding",
                          "snippet": "In conjunction with the funding, Sri Pangulur, partner at Tribe Capital, joined Apollo.io’s board.",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2021-11-01T21:44:42.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "6151bee43115c900a4ec4e94",
                          "url": "https://techrseries.com/hrtechnology/apollo-io-appoints-lisa-feher-as-chief-people-officer/",
                          "domain": "techrseries.com",
                          "title": "Apollo.IO Appoints Lisa Feher as Chief People Officer",
                          "snippet": "Apollo.io, a lead intelligence and sales engagement platform, has announced that Lisa Feher has joined the company as its Chief People Officer.",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2021-09-17T00:00:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "61fdec31979c2300a50b5619",
                          "url": "https://blog.apollo.io/blog/apollo-announces-appointment-of-santosh-sharan-as-president-and-coo",
                          "domain": "apollo.io",
                          "title": "Apollo Announces Appointment of Santosh Sharan as President and COO — Apollo Blog",
                          "snippet": "SAN FRANCISCO, April 15, 2021 /PRNewswire/ -- Apollo, a leading data intelligence and sales engagement platform, announces that Santosh Sharan has joined the company as President and Chief Operating Officer (COO).",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2021-04-15T00:00:00.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        },
                        {
                          "id": "61413082e89bde40f424c677",
                          "url": "https://nexusvp.com/press-releases/apollo-io-brings-on-clearslide-co-founder-jim-benton-as-ceo/",
                          "domain": "nexusvp.com",
                          "title": "Apollo.io Brings on ClearSlide Co-Founder Jim Benton as CEO – Nexus Venture Partners",
                          "snippet": "(BUSINESS WIRE)–Apollo.io, the most intelligent data-first engagement platform for sales and marketing teams, today announced that it has hired Jim Benton as CEO.",
                          "organization_ids": [
                            "5e66b6381e05b4008c8331b8"
                          ],
                          "published_at": "2019-06-06T16:00:44.000+00:00",
                          "event_categories": [
                            "hires"
                          ]
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized",
            "content": {
              "text/plain": {
                "examples": {
                  "Check API Key": {
                    "value": "Invalid access credentials.",
                    "summary": "Check API Key"
                  }
                }
              }
            }
          },
          "422": {
            "description": "Unprocessable Entity",
            "content": {
              "application/json": {
                "examples": {
                  "Add Organization IDs": {
                    "value": {
                      "error": "organization_ids is required"
                    },
                    "summary": "Add Organization IDs"
                  }
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "organization_ids[]",
            "in": "query",
            "required": true,
            "description": "The Apollo IDs for the companies you want to include in your search results. Each company in the Apollo database is assigned a unique ID. <br><br>To find IDs, call the <a href=\"https://docs.apollo.io/reference/organization-search\" target=\"_blank\">Organization Search endpoint</a> and identify the values for `organization_id`.  <br><br>Example: `5e66b6381e05b4008c8331b8`",
            "schema": {
              "type": "array",
              "default": "",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "categories[]",
            "in": "query",
            "required": false,
            "description": "Filter your search to include only certain categories or sub-categories of news. Use the <b>News</b> search filter for companies within Apollo to uncover all possible categories and sub-categories. <br><br>Examples: `hires`; `investment`; `contract`",
            "schema": {
              "type": "array",
              "default": "",
              "items": {
                "type": "string"
              }
            }
          },
          {
            "name": "published_at[min]",
            "in": "query",
            "required": false,
            "description": "Set the lower bound of the date range you want to search. <br><br>Use this parameter in combination with the `published_at[max]` parameter. This date should fall before the `published_at[max]` date. <br><br>The date should be formatted as `YYYY-MM-DD`. <br><br>Example: `2025-02-15`",
            "schema": {
              "type": "string",
              "format": "date",
              "default": ""
            }
          },
          {
            "name": "published_at[max]",
            "in": "query",
            "required": false,
            "description": "Set the upper bound of the date range you want to search. <br><br>Use this parameter in combination with the `published_at[min]` parameter. This date should fall after the `published_at[min]` date. <br><br>The date should be formatted as `YYYY-MM-DD`. <br><br>Example: `2025-05-15`",
            "schema": {
              "type": "string",
              "format": "date",
              "default": ""
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "description": "The page number of the Apollo data that you want to retrieve. <br><br>Use this parameter in combination with the `per_page` parameter to make search results for navigable and improve the performance of the endpoint. <br><br>Example: `4`",
            "schema": {
              "type": "integer",
              "default": ""
            }
          },
          {
            "name": "per_page",
            "in": "query",
            "required": false,
            "description": "The number of search results that should be returned for each page. Limiting the number of results per page improves the endpoint's performance. <br><br>Use the `page` parameter to search the different pages of data. <br><br>Example: `10`",
            "schema": {
              "type": "integer",
              "default": ""
            }
          }
        ]
      }
    }
  },
  "x-readme": {
    "headers": [
      {
        "key": "Cache-Control",
        "value": "no-cache"
      },
      {
        "key": "Content-Type",
        "value": "application/json"
      }
    ],
    "explorer-enabled": true,
    "proxy-enabled": true
  },
  "x-readme-fauxas": true
}
```