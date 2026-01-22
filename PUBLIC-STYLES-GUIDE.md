# Public Website Shared Styles Implementation Guide

## Overview
This guide shows how to update all public-facing HTML pages to use the shared CSS and JavaScript files instead of inline styles.

## ✅ Benefits of Shared Files
- **Easier maintenance**: Update styles in one place, affects all pages
- **Better performance**: Browsers cache the CSS/JS files across pages
- **Consistency**: Ensures all pages have identical styling
- **Cleaner HTML**: Removes thousands of lines of inline CSS from each HTML file

---

## 📁 New Files Created

### 1. `/styles/public.css`
Shared stylesheet with:
- ✨ **Enhanced button designs** (gradient primary buttons, better hover states)
- ✨ **Improved blur effects** on header scroll (more pronounced transparency)
- ✨ **Stronger shadows** across all elements
- All header navigation styles
- Responsive mobile menu styles
- Scroll animations

### 2. `/scripts/public.js`
Shared JavaScript with:
- Header scroll detection (adds `.scrolled` class for blur effect)
- Mobile navigation toggle
- Scroll animation initialization

---

## 🔧 How to Update Each HTML Page

### Step 1: Add Links in `<head>` Section

**Add BEFORE the closing `</head>` tag:**

```html
<!-- Google Fonts (keep existing) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

<!-- Shared Public Styles -->
<link rel="stylesheet" href="/styles/public.css">

<!-- Apollo Tracking Script (keep existing) -->
<script>function initApollo(){...}</script>
</head>
```

### Step 2: Add Script Before Closing `</body>` Tag

**Add BEFORE the closing `</body>` tag:**

```html
<!-- Shared Public Scripts -->
<script src="/scripts/public.js"></script>

<!-- Keep any page-specific scripts below -->
<script>
  // Year
  document.getElementById('y').textContent = new Date().getFullYear();
  
  // Page-specific code...
</script>
</body>
```

### Step 3: Remove Inline Styles (SUPER IMPORTANT)

**Delete these `<style>` blocks from each HTML file:**

1. Main styles block (starting with `:root { --brand-blue: #0b1b45; ...}`)
2. Animation styles block (`@keyframes fadeInUp { ... }`)
3. Any header/navigation duplicate styles

**Keep these inline styles:**
- Page-specific styles (hero sections, unique page layouts)
- Component-specific styles not used on other pages

---

## 📋 Implementation Checklist

### Files to Update:
- [ ] `/index.html`
- [ ] `/about.html`
- [ ] `/services.html`
- [ ] `/resources.html`
- [ ] `/schedule.html`
- [ ] `/tdu-delivery-charges.html`
- [ ] Any other public HTML files

### For Each File:
- [ ] Add `<link rel="stylesheet" href="/styles/public.css">` in `<head>`
- [ ] Add `<script src="/scripts/public.js"></script>` before `</body>`
- [ ] Remove duplicate header/button/animation styles from inline `<style>` tags
- [ ] Test mobile navigation toggle
- [ ] Test header blur effect on scroll
- [ ] Test button hover effects

---

## 🎨 What's Different (Improvements)

### Before vs After:

| Feature | Before | After |
|---------|--------|-------|
| **Header Blur** | `blur(10px)`, subtle | `blur(20px) saturate(200%)` when scrolled - **much more obvious** |
| **Header Shadow** | `0 1px 3px rgba(0,0,0,.05)` | `0 8px 32px rgba(0,0,0,.12)` when scrolled |
| **Button Border** | `1px solid` | `2px solid` - more prominent |
| **Primary Button** | Basic gradient | Enhanced gradient with glow effect on hover |
| **Outline Button** | Minimal shadow | Blur backdrop + prominent shadow on hover |
| **Mobile Menu** | Basic blur | Enhanced blur with `saturate(180%)` |

---

## 🧪 Testing

After updating each page:

1. **Scroll Test**:
   - Load the page
   - Scroll down 100px
   - Header should get noticeably more blurred and shadowed

2. **Button Test**:
   - Hover over "Contact" button → Should glow orange
   - Hover over "About/Services/etc." → Should show orange border and light background
   - Click any button → Should scale down slightly

3. **Mobile Test**:
   - Resize browser to mobile width (<768px)
   - Click hamburger menu → Menu should slide down with strong blur
   - Click a link → Menu should close

---

## 📝 Example: index.html Update

### BEFORE (Current):
```html
<head>
  <meta charset="UTF-8">
  <title>Power Choosers</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet">
  
  <style>
    :root {
      --brand-blue: #0b1b45;
      --brand-orange: #f59e0b;
      /* ... 900+ lines of CSS ... */
    }
  </style>
  
  <style>
    @keyframes fadeInUp {
      /* Animation code */
    }
  </style>
  
  <script>function initApollo(){...}</script>
</head>
```

### AFTER (New):
```html
<head>
  <meta charset="UTF-8">
  <title>Power Choosers</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet">
  
  <!-- Shared styles replace inline CSS -->
  <link rel="stylesheet" href="/styles/public.css">
  
  <!-- Optional: Page-specific styles -->
  <style>
    /* Keep only page-specific styles like hero section, etc. */
    .hero { /* ... */ }
  </style>
  
  <script>function initApollo(){...}</script>
</head>
```

---

## ⚡ Quick Start (Do This First)

**Update `index.html` first as a test:**

1. Open `/index.html`
2. Add `<link rel="stylesheet" href="/styles/public.css">` after Google Fonts link
3. Add `<script src="/scripts/public.js"></script>` before closing `</body>`
4. Test in browser - everything should work
5. If working, delete the inline header/button/animation styles
6. Test again - should look identical or better
7. Proceed to other pages

---

## 🆘 Troubleshooting

**Issue: Styles don't load**
- Check file path: `/styles/public.css` or `styles/public.css`
- Verify files are in correct location
- Check browser console for 404 errors

**Issue: Blur doesn't work on scroll**
- Ensure `/scripts/public.js` is loaded
- Check browser console for JavaScript errors
- Verify header has class `.site-header`

**Issue: Buttons look wrong**
- Check if inline styles are overriding shared styles
- Remove conflicting inline `.btn` styles
- Clear browser cache

---

## 💡 Next Steps

Once all pages are updated:
- Any future header/button changes only require editing `/styles/public.css`
- All pages automatically get the updates
- Much easier to maintain and improve

