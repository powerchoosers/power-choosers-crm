# Load Balancer Cost Breakdown
## Power Choosers CRM - Monthly Cost Analysis

**Date Created:** November 21, 2025  
**Services:** Application Load Balancer, Cloud CDN, Cloud Armor, SSL Certificate

---

## Cost Components

### Fixed Monthly Costs

1. **Application Load Balancer Forwarding Rules**
   - **Cost:** $18.00/month
   - **Type:** Fixed (regardless of traffic)

2. **Cloud Armor (Standard Tier)**
   - **Cost:** $0.00/month
   - **Type:** Included with load balancer

3. **SSL Certificate (Google-managed)**
   - **Cost:** $0.00/month
   - **Type:** Free

**Total Fixed Monthly Cost: $18.00**

---

### Variable Costs (Based on Traffic)

#### Application Load Balancer Data Processing
- **Rate:** $0.008 - $0.025 per GB
- **Average:** $0.0165 per GB (midpoint)
- **Applies to:** All data processed through load balancer

#### Cloud CDN
- **Cache Egress:** $0.08 per GB (served from cache)
- **Cache Fill:** $0.12 per GB (cache misses, fetched from origin)
- **Applies to:** Cached content served to users

---

## Assumptions

For cost calculations, we assume:
- **Average page size:** 100 KB (HTML + images per blog post)
- **Cache hit ratio:** 70% (after initial warmup period)
- **Cache miss ratio:** 30% (requests that need to fetch from origin)
- **Data processing rate:** $0.0165 per GB (average of $0.008-$0.025 range)

---

## Monthly Cost Breakdown by Traffic Volume

### 0 Hits/Month
| Component | Cost |
|-----------|------|
| Load Balancer (Fixed) | $18.00 |
| Data Processing | $0.00 |
| Cloud CDN Egress | $0.00 |
| Cloud CDN Fill | $0.00 |
| Cloud Armor | $0.00 |
| SSL Certificate | $0.00 |
| **Total** | **$18.00** |

---

### 10,000 Hits/Month
**Data Transfer:** ~1.0 GB total
- Cache hits (70%): 7,000 hits × 100 KB = 700 MB = 0.7 GB
- Cache misses (30%): 3,000 hits × 100 KB = 300 MB = 0.3 GB

| Component | Calculation | Cost |
|-----------|-------------|------|
| Load Balancer (Fixed) | - | $18.00 |
| Data Processing | 1.0 GB × $0.0165 | $0.02 |
| Cloud CDN Egress | 0.7 GB × $0.08 | $0.06 |
| Cloud CDN Fill | 0.3 GB × $0.12 | $0.04 |
| Cloud Armor | Included | $0.00 |
| SSL Certificate | Free | $0.00 |
| **Total** | | **$18.12** |

---

### 25,000 Hits/Month
**Data Transfer:** ~2.5 GB total
- Cache hits (70%): 17,500 hits × 100 KB = 1.75 GB
- Cache misses (30%): 7,500 hits × 100 KB = 0.75 GB

| Component | Calculation | Cost |
|-----------|-------------|------|
| Load Balancer (Fixed) | - | $18.00 |
| Data Processing | 2.5 GB × $0.0165 | $0.04 |
| Cloud CDN Egress | 1.75 GB × $0.08 | $0.14 |
| Cloud CDN Fill | 0.75 GB × $0.12 | $0.09 |
| Cloud Armor | Included | $0.00 |
| SSL Certificate | Free | $0.00 |
| **Total** | | **$18.27** |

---

### 50,000 Hits/Month
**Data Transfer:** ~5.0 GB total
- Cache hits (70%): 35,000 hits × 100 KB = 3.5 GB
- Cache misses (30%): 15,000 hits × 100 KB = 1.5 GB

| Component | Calculation | Cost |
|-----------|-------------|------|
| Load Balancer (Fixed) | - | $18.00 |
| Data Processing | 5.0 GB × $0.0165 | $0.08 |
| Cloud CDN Egress | 3.5 GB × $0.08 | $0.28 |
| Cloud CDN Fill | 1.5 GB × $0.12 | $0.18 |
| Cloud Armor | Included | $0.00 |
| SSL Certificate | Free | $0.00 |
| **Total** | | **$18.54** |

---

### 100,000 Hits/Month
**Data Transfer:** ~10.0 GB total
- Cache hits (70%): 70,000 hits × 100 KB = 7.0 GB
- Cache misses (30%): 30,000 hits × 100 KB = 3.0 GB

| Component | Calculation | Cost |
|-----------|-------------|------|
| Load Balancer (Fixed) | - | $18.00 |
| Data Processing | 10.0 GB × $0.0165 | $0.17 |
| Cloud CDN Egress | 7.0 GB × $0.08 | $0.56 |
| Cloud CDN Fill | 3.0 GB × $0.12 | $0.36 |
| Cloud Armor | Included | $0.00 |
| SSL Certificate | Free | $0.00 |
| **Total** | | **$19.09** |

---

### 250,000 Hits/Month
**Data Transfer:** ~25.0 GB total
- Cache hits (70%): 175,000 hits × 100 KB = 17.5 GB
- Cache misses (30%): 75,000 hits × 100 KB = 7.5 GB

| Component | Calculation | Cost |
|-----------|-------------|------|
| Load Balancer (Fixed) | - | $18.00 |
| Data Processing | 25.0 GB × $0.0165 | $0.41 |
| Cloud CDN Egress | 17.5 GB × $0.08 | $1.40 |
| Cloud CDN Fill | 7.5 GB × $0.12 | $0.90 |
| Cloud Armor | Included | $0.00 |
| SSL Certificate | Free | $0.00 |
| **Total** | | **$20.71** |

---

### 500,000 Hits/Month
**Data Transfer:** ~50.0 GB total
- Cache hits (70%): 350,000 hits × 100 KB = 35.0 GB
- Cache misses (30%): 150,000 hits × 100 KB = 15.0 GB

| Component | Calculation | Cost |
|-----------|-------------|------|
| Load Balancer (Fixed) | - | $18.00 |
| Data Processing | 50.0 GB × $0.0165 | $0.83 |
| Cloud CDN Egress | 35.0 GB × $0.08 | $2.80 |
| Cloud CDN Fill | 15.0 GB × $0.12 | $1.80 |
| Cloud Armor | Included | $0.00 |
| SSL Certificate | Free | $0.00 |
| **Total** | | **$23.43** |

---

## Cost Summary Table

| Monthly Hits | Total Cost | Cost per 1,000 Hits | Cost per Hit |
|--------------|------------|---------------------|--------------|
| 0 | $18.00 | N/A | N/A |
| 10,000 | $18.12 | $1.81 | $0.0018 |
| 25,000 | $18.27 | $0.73 | $0.0007 |
| 50,000 | $18.54 | $0.37 | $0.0004 |
| 100,000 | $19.09 | $0.19 | $0.0002 |
| 250,000 | $20.71 | $0.08 | $0.00008 |
| 500,000 | $23.43 | $0.05 | $0.00005 |

---

## Key Insights

1. **Fixed Cost Dominates at Low Traffic**
   - At 10,000 hits/month, fixed costs ($18) represent 99.3% of total cost
   - Variable costs are minimal at low traffic volumes

2. **Economies of Scale**
   - Cost per hit decreases significantly as traffic increases
   - At 500,000 hits/month, cost per hit is only $0.00005 (half a cent per 100 hits)

3. **CDN Efficiency**
   - 70% cache hit ratio significantly reduces origin load
   - Cache egress ($0.08/GB) is cheaper than cache fill ($0.12/GB)

4. **Cost Predictability**
   - Fixed $18/month base cost provides predictable minimum
   - Variable costs scale linearly with traffic

---

## Additional Considerations

### Cloud Run Costs (Not Included Above)
- Cloud Run has its own pricing for compute and requests
- Load balancer costs are separate from Cloud Run service costs
- Cloud Run costs depend on:
  - Number of requests
  - CPU/memory usage
  - Request duration

### Potential Cost Optimizations

1. **Increase Cache Hit Ratio**
   - Better cache configuration can increase hit ratio to 80-90%
   - Reduces cache fill costs

2. **Optimize Page Size**
   - Smaller pages = less data transfer
   - Image optimization can reduce page size significantly

3. **Regional Pricing**
   - Prices may vary slightly by region
   - Current estimates based on US pricing

---

## Cost Scenarios

### Low Traffic Scenario (10K-50K hits/month)
- **Monthly Cost:** $18-19
- **Primary Cost:** Fixed load balancer fee
- **Recommendation:** Cost-effective for low traffic sites

### Medium Traffic Scenario (100K-250K hits/month)
- **Monthly Cost:** $19-21
- **Cost Efficiency:** Very good - only $0.08-0.19 per 1,000 hits
- **Recommendation:** Excellent value for medium traffic

### High Traffic Scenario (500K+ hits/month)
- **Monthly Cost:** $23+
- **Cost Efficiency:** Excellent - $0.05 per 1,000 hits
- **Recommendation:** Highly cost-effective at scale

---

## Notes

- All prices are estimates based on Google Cloud pricing as of November 2025
- Actual costs may vary based on:
  - Regional pricing differences
  - Actual cache hit ratios
  - Page size variations
  - Data processing rate variations ($0.008-$0.025 range)
- Cloud Run service costs are separate and not included
- Prices subject to change by Google Cloud

---

**Last Updated:** November 21, 2025

