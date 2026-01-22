I have researched the code and devised a plan to implement the requested UI changes and the smart phone number mapping logic.

### 1. Smart Phone Mapping Logic (`apollo.js`)

I will implement a "smart distribution" algorithm in the Apollo widget that runs before saving data to the contact. This ensures we maximize the use of the 3 available fields (`mobile`, `workDirectPhone`, `otherPhone`) even if Apollo returns multiple numbers of the same type.

* **Logic**:

  * Bucket incoming numbers by type (Mobile, Work, Other).

  * Fill primary slots first (Mobile -> `mobile`, Work -> `workDirectPhone`).

  * **Handle Overflow**:

    * If we have a 2nd Mobile, put it in `otherPhone` (if empty).

    * If we have a 2nd Other, put it in `mobile` or `workDirectPhone` (if empty).

    * This guarantees that "2 mobiles" result in 1 Mobile + 1 Other, exactly as requested.

### 2. UI Updates (`contact-detail.js`)

I will redesign the `renderPhoneRow` and `renderEmailRow` functions to match your visual requirements:

* **Phone Numbers**:

  * Add a **green checkmark phone icon** to the left.

  * Display the **Phone Type** (e.g., "Mobile", "Work Direct") directly *below* the number in a lighter/darker weight.

  * Add a "Primary" label next to the type if applicable.

* **Emails**:

  * Add a **green checkmark email icon** to the left.

  * Display "Primary Email" directly *below* the email address.

### 3. Widget UI Updates (`apollo.js`)

I will also update the immediate "Reveal" popup in the widget to reflect these same style changes (icons + type below number) so the experience is consistent the moment the data is revealed.

### Files to Modify

* `scripts/widgets/apollo.js`: Add mapping logic and update widget UI.

* `scripts/pages/contact-detail.js`: Update `renderPhoneRow` and `renderEmailRow` for the main contact view.

