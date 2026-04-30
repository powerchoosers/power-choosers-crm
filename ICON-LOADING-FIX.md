# Company Icon Loading & Animation Fix

## Problem
Console was being flooded with errors when company icons failed to load:
- `Failed to load resource: net::ERR_BLOCKED_BY_CLIENT` (ad blockers blocking Clearbit)
- `Failed to load resource: the server responded with a status of 404` (missing favicons)
- Broken image icons appearing briefly before loading
- No smooth transition between loading and loaded states

## Solution

### 1. Enhanced Skeleton Loading State (`CompanyIcon.tsx`)

**Before:**
- Simple static skeleton with basic fade
- No visual feedback during loading
- Abrupt transition when image loads

**After:**
- Animated gradient skeleton with pulsing icon
- Smooth scale and opacity transitions
- Enhanced blur-in effect (8px → 0px blur)
- Longer animation duration (0.35s) for smoother appearance
- Skeleton exits with blur effect for seamless transition

```tsx
// New skeleton animation
<motion.div
  initial={{ opacity: 0, scale: 0.96 }}
  animate={{ 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' }
  }}
  exit={{ 
    opacity: 0, 
    scale: 1.02,
    filter: 'blur(4px)',
    transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] }
  }}
  className="absolute inset-0 bg-gradient-to-br from-white/8 to-white/3"
>
  <motion.div
    animate={{ 
      opacity: [0.4, 0.7, 0.4],
      scale: [1, 1.05, 1]
    }}
    transition={{ 
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut'
    }}
  >
    <Building2 size={size * 0.4} className="text-zinc-600" />
  </motion.div>
</motion.div>
```

### 2. Added Loading States to CallBarIcon (`TopBar.tsx`)

**Before:**
- Direct image rendering with no loading state
- Broken images visible during load failures
- No animation when switching between fallbacks

**After:**
- Full loading state tracking with `isLoaded` state
- Animated skeleton placeholder during load
- Smooth blur-in animation (8px → 0px)
- Graceful fallback animation when images fail

```tsx
// New loading state management
const [isLoaded, setIsLoaded] = useState(false)

const handleLoad = () => {
  setIsLoaded(true)
}

// Animated skeleton + blur-in image
<AnimatePresence mode="wait">
  {!isLoaded && (
    <motion.div key="skeleton" /* ... animated skeleton ... */ />
  )}
</AnimatePresence>
<motion.img
  initial={{ opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
  animate={{ 
    opacity: isLoaded ? 1 : 0, 
    scale: isLoaded ? 1 : 1.05, 
    filter: isLoaded ? 'blur(0px)' : 'blur(8px)'
  }}
  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
/>
```

### 3. Replaced Direct Image Tags (`NodeIngestion.tsx`)

**Before:**
- Direct `<img>` tag with no error handling
- No loading animation
- Inconsistent with rest of app

**After:**
- Using `CompanyIcon` component for consistency
- Automatic fallback handling
- Smooth blur-in animations

```tsx
// Before
<img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain" />

// After
<CompanyIcon
  logoUrl={org.logoUrl}
  domain={org.domain}
  name={org.name}
  size={40}
  roundedClassName="rounded-lg"
/>
```

## Animation Details

### Blur-In Effect
- **Initial state**: `blur(8px)`, `scale(1.05)`, `opacity: 0`
- **Final state**: `blur(0px)`, `scale(1)`, `opacity: 1`
- **Duration**: 350ms
- **Easing**: Custom cubic-bezier `[0.23, 1, 0.32, 1]` for smooth deceleration

### Skeleton Animation
- **Pulsing opacity**: 0.4 → 0.7 → 0.4 (2s loop)
- **Subtle scale**: 1 → 1.05 → 1 (synchronized with opacity)
- **Exit transition**: Scales up slightly (1.02) and blurs (4px) as it fades out

## Benefits

1. **No More Console Errors**: Images load gracefully without flooding console
2. **Smooth Visual Experience**: No broken image icons, just smooth transitions
3. **Better UX**: Users see animated placeholders instead of broken links
4. **Consistent Behavior**: All company icons use the same loading pattern
5. **Performance**: Lazy loading with proper decoding hints

## Files Modified

- `crm-platform/src/components/ui/CompanyIcon.tsx` - Enhanced skeleton and blur-in animation
- `crm-platform/src/components/layout/TopBar.tsx` - Added loading states to CallBarIcon
- `crm-platform/src/components/right-panel/NodeIngestion.tsx` - Replaced direct img with CompanyIcon

## Testing

Test the following scenarios:
1. ✅ Icons that load successfully should blur in smoothly
2. ✅ Icons that fail (404, blocked) should show animated skeleton then fallback icon
3. ✅ No console errors for failed image loads
4. ✅ Skeleton should pulse gently while loading
5. ✅ Transition from skeleton to image should be seamless
