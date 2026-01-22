(function () {
  if (!window.PCEmailBuilder) window.PCEmailBuilder = {};

  const state = {
    overlay: null,
    activeEditor: null
  };

  function closeOverlay() {
    if (state.overlay && state.overlay.parentNode) {
      state.overlay.parentNode.removeChild(state.overlay);
    }
    state.overlay = null;
    state.activeEditor = null;
  }

  function createVarChip(scope, key, label) {
    const token = "{{" + scope + "." + key + "}}";
    const span = document.createElement("span");
    span.className = "var-chip";
    span.setAttribute("data-var", scope + "." + key);
    span.setAttribute("data-token", token);
    span.setAttribute("contenteditable", "false");
    span.textContent = label || key.replace(/_/g, " ");
    span.title = token;
    return span;
  }

  function insertVarIntoActiveEditor(scope, key, label) {
    const editor = state.activeEditor;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return;
    let range;
    if (sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
      if (!editor.contains(range.startContainer)) {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }
    } else {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    const chip = createVarChip(scope, key, label);
    range.deleteContents();
    range.insertNode(chip);
    range.setStartAfter(chip);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function tokenizeHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    tmp.querySelectorAll(".var-chip").forEach(function (chip) {
      const token = chip.getAttribute("data-token") || chip.getAttribute("data-var") || chip.textContent || "";
      const asToken = token.indexOf("{{") === 0 ? token : "{{" + token + "}}";
      chip.replaceWith(document.createTextNode(asToken));
    });
    return tmp.innerHTML;
  }

  function tokenizedTextFromEl(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    if (clone.querySelectorAll) {
      clone.querySelectorAll(".var-chip").forEach(function (chip) {
        const token = chip.getAttribute("data-token") || chip.getAttribute("data-var") || chip.textContent || "";
        const asToken = token.indexOf("{{") === 0 ? token : "{{" + token + "}}";
        chip.replaceWith(document.createTextNode(asToken));
      });
    }
    return (clone.textContent || "").trim();
  }

  function tokenizedHtmlFromEl(el) {
    if (!el) return "";
    return tokenizeHtml(el.innerHTML || "");
  }

  function getBlockDefs() {
    return [
      { id: "hero", label: "Hero header" },
      { id: "text", label: "Paragraph" },
      { id: "bullets", label: "Bulleted list" },
      { id: "cta", label: "Call-to-action" },
      { id: "divider", label: "Divider" },
      { id: "image-regular", label: "Regular Image" },
      { id: "image-rectangle", label: "Rectangle Image" },
      { id: "video", label: "Video link" },
      { id: "columns-2", label: "Two columns" },
      { id: "spacer", label: "Spacer" }
    ];
  }

  function getBlockIconSvg(type) {
    const common = 'viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

    if (type === "hero") {
      return '<svg ' + common + '><path d="M12 3l2.2 6.3 6.6.7-5 3.6 1.7 6.4L12 16.9 6.5 20l1.7-6.4-5-3.6 6.6-.7L12 3z"/></svg>';
    }
    if (type === "text") {
      return '<svg ' + common + '><path d="M6 7h12"/><path d="M6 11h12"/><path d="M6 15h8"/></svg>';
    }
    if (type === "bullets") {
      return '<svg ' + common + '><circle cx="6" cy="7" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="6" cy="17" r="1"/><path d="M10 7h8"/><path d="M10 12h8"/><path d="M10 17h8"/></svg>';
    }
    if (type === "cta") {
      return '<svg ' + common + '><circle cx="12" cy="12" r="9"/><path d="M10 8l4 4-4 4"/><path d="M8 12h6"/></svg>';
    }
    if (type === "divider") {
      return '<svg ' + common + '><path d="M4 12h16"/><path d="M7 9v6"/><path d="M17 9v6"/></svg>';
    }
    if (type === "image-regular" || type === "image-rectangle") {
      return '<svg ' + common + '><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M7 15l2-2 3 3 2-2 3 3"/><circle cx="9" cy="10" r="1"/></svg>';
    }
    if (type === "video") {
      return '<svg ' + common + '><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M11 10l4 2-4 2v-4z"/></svg>';
    }
    if (type === "columns-2") {
      return '<svg ' + common + '><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14"/></svg>';
    }
    if (type === "spacer") {
      return '<svg ' + common + '><path d="M12 6v12"/><path d="M9 9l3-3 3 3"/><path d="M9 15l3 3 3-3"/></svg>';
    }

    return '<svg ' + common + '><circle cx="12" cy="12" r="9"/></svg>';
  }

  function getYouTubeId(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    const m = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    return m ? m[1] : "";
  }

  function normalizeHref(href) {
    let out = String(href || "").trim();
    if (!out) return "";
    if (!/^(https?:|mailto:|tel:)/i.test(out)) out = "https://" + out;
    return out;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildEmailPreviewFrame(defaults) {
    const d = defaults || {};

    const bg = document.createElement("div");
    bg.className = "pc-eb-preview-bg";

    const container = document.createElement("div");
    container.className = "pc-eb-preview-container";

    const header = document.createElement("div");
    header.className = "pc-eb-preview-header";

    const logo = document.createElement("img");
    logo.className = "pc-eb-preview-logo";
    logo.alt = "Power Choosers";
    logo.src = d.logoUrl || "https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png";

    const pill = document.createElement("div");
    pill.className = "pc-eb-preview-pill";
    const dot = document.createElement("span");
    dot.className = "pc-eb-preview-pill-dot";
    const pillText = document.createElement("span");
    pillText.className = "pc-eb-preview-pill-text";
    pillText.contentEditable = "true";
    pillText.setAttribute("data-placeholder", "Pill label");
    pillText.textContent = d.pillText || "2026 ENERGY MARKET UPDATE";
    pill.appendChild(dot);
    pill.appendChild(pillText);

    const subject = document.createElement("div");
    subject.className = "pc-eb-preview-subject";
    subject.contentEditable = "true";
    subject.setAttribute("data-placeholder", "Email subject / headline");
    subject.textContent = d.subject || "";

    const subline = document.createElement("div");
    subline.className = "pc-eb-preview-subline";
    subline.contentEditable = "true";
    subline.setAttribute("data-placeholder", "Header subline");
    subline.textContent = d.subline || "Signals from the next 6–12 months, translated into simple decisions.";

    header.appendChild(logo);
    header.appendChild(pill);
    header.appendChild(subject);
    header.appendChild(subline);

    const body = document.createElement("div");
    body.className = "pc-eb-preview-body";

    container.appendChild(header);
    container.appendChild(body);
    bg.appendChild(container);

    return {
      root: bg,
      blocksContainer: body,
      header: {
        logoEl: logo,
        pillTextEl: pillText,
        subjectEl: subject,
        sublineEl: subline
      }
    };
  }

  function createBlock(type) {
    const el = document.createElement("div");
    el.className = "pc-eb-block";
    el.setAttribute("data-block-type", type);
    el.draggable = false; // Default to false to prevent buggy selection behavior

    const header = document.createElement("div");
    header.className = "pc-eb-block-header";

    const title = document.createElement("div");
    title.className = "pc-eb-block-title";
    if (type === "hero") title.textContent = "Hero header";
    else if (type === "text") title.textContent = "Paragraph";
    else if (type === "bullets") title.textContent = "Bulleted list";
    else if (type === "cta") title.textContent = "Call-to-action";
    else if (type === "divider") title.textContent = "Divider";
    else if (type === "image-regular") title.textContent = "Regular Image";
    else if (type === "image-rectangle") title.textContent = "Rectangle Image";
    else if (type === "video") title.textContent = "Video link";
    else if (type === "columns-2") title.textContent = "Two columns";
    else if (type === "spacer") title.textContent = "Spacer";

    const actions = document.createElement("div");
    actions.className = "pc-eb-block-actions";

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "pc-eb-block-handle";
    dragHandle.innerHTML = "≡";
    dragHandle.setAttribute("aria-label", "Drag to reorder");

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "pc-eb-block-remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", "Remove block");

    actions.appendChild(dragHandle);
    actions.appendChild(removeBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "pc-eb-block-body";

    if (type === "hero") {
      const h = document.createElement("div");
      h.className = "pc-eb-hero-heading";
      h.contentEditable = "true";
      h.textContent = "Hi {{contact.first_name}},";
      const sub = document.createElement("div");
      sub.className = "pc-eb-hero-sub";
      sub.contentEditable = "true";
      sub.textContent = "A modern energy update tailored to your facilities.";
      body.appendChild(h);
      body.appendChild(sub);
    } else if (type === "text") {
      const t = document.createElement("div");
      t.className = "pc-eb-text";
      t.contentEditable = "true";
      t.textContent = "Add your paragraph here.";
      body.appendChild(t);
    } else if (type === "bullets") {
      const list = document.createElement("ul");
      list.className = "pc-eb-list";
      for (let i = 0; i < 3; i++) {
        const li = document.createElement("li");
        li.contentEditable = "true";
        li.textContent = i === 0 ? "Key benefit or insight" : "Additional point";
        list.appendChild(li);
      }
      body.appendChild(list);
    } else if (type === "cta") {
      const label = document.createElement("div");
      label.className = "pc-eb-cta-label";
      label.contentEditable = "true";
      label.textContent = "Schedule a 15-minute call";
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.className = "pc-eb-cta-url";
      urlInput.placeholder = "https://";
      urlInput.value = "https://powerchoosers.com/schedule";
      body.appendChild(label);
      body.appendChild(urlInput);
    } else if (type === "divider") {
      const line = document.createElement("div");
      line.className = "pc-eb-divider-line";
      body.appendChild(line);
    } else if (type === "image-regular" || type === "image-rectangle") {
      // --- Header Toolbar ---
      const toolbar = document.createElement("div");
      toolbar.className = "pc-eb-image-toolbar";
      toolbar.style.display = "flex";
      toolbar.style.gap = "4px";
      toolbar.style.marginLeft = "auto";
      toolbar.style.marginRight = "8px";
      toolbar.style.alignItems = "center";

      // Insert toolbar before the actions (drag/remove) buttons
      // We know 'actions' is the last child of header currently
      header.insertBefore(toolbar, actions);

      const optionsContainer = document.createElement("div");
      optionsContainer.className = "pc-eb-image-options";
      optionsContainer.style.marginBottom = "8px";
      optionsContainer.style.backgroundColor = "rgba(15,23,42,0.95)";
      optionsContainer.style.borderRadius = "6px";
      optionsContainer.style.border = "1px solid rgba(148,163,184,0.25)";
      optionsContainer.style.display = "none"; // Hide container if no options active

      const activeOptions = new Set();

      function toggleOption(key, row) {
        if (activeOptions.has(key)) {
          activeOptions.delete(key);
          row.style.maxHeight = "0";
          row.style.opacity = "0";
          row.style.padding = "0 8px";
          row.style.borderBottom = "none";
          setTimeout(() => {
             if (!activeOptions.size) optionsContainer.style.display = "none";
          }, 300);
        } else {
          activeOptions.add(key);
          optionsContainer.style.display = "block";
          
          // Force reflow/wait for next frame to ensure "open" animation plays
          requestAnimationFrame(() => {
            row.style.maxHeight = "100px"; // approximate
            row.style.opacity = "1";
            row.style.padding = "8px";
            row.style.borderBottom = "1px solid #334155";
          });
        }
      }

      function createToolbarBtn(label, iconSvg, key, row) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pc-eb-toolbar-btn";
        btn.innerHTML = iconSvg;
        btn.title = label;
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.width = "24px";
        btn.style.height = "24px";
        btn.style.padding = "0";
        btn.style.border = "1px solid transparent";
        btn.style.borderRadius = "4px";
        btn.style.background = "transparent";
        btn.style.color = "#94a3b8";
        btn.style.cursor = "pointer";
        btn.style.transition = "all 0.2s";

        btn.addEventListener("mouseover", () => {
             if (!activeOptions.has(key)) btn.style.background = "rgba(148,163,184,0.1)";
        });
        btn.addEventListener("mouseout", () => {
             if (!activeOptions.has(key)) btn.style.background = "transparent";
        });

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isActive = activeOptions.has(key);
          // Toggle Visuals
          btn.style.background = isActive ? "transparent" : "rgba(148,163,184,0.2)";
          btn.style.color = isActive ? "#94a3b8" : "#f1f5f9";
          btn.style.borderColor = isActive ? "transparent" : "rgba(148,163,184,0.2)";
          toggleOption(key, row);
        });
        
        return btn;
      }

      // --- Inputs & Rows ---
      
      function createInputRow(input) {
        const row = document.createElement("div");
        row.style.maxHeight = "0";
        row.style.opacity = "0";
        row.style.overflow = "hidden";
        row.style.transition = "all 0.3s ease";
        row.appendChild(input);
        return row;
      }

      function styleDarkInput(input) {
          input.style.width = "100%";
          input.style.backgroundColor = "#0f172a";
          input.style.color = "#e2e8f0";
          input.style.border = "1px solid #334155";
          input.style.borderRadius = "4px";
          input.style.padding = "6px 10px";
      }

      // URL
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.className = "pc-eb-cta-url pc-eb-image-url";
      urlInput.placeholder = "Image URL (https://...)";
      styleDarkInput(urlInput);
      const urlRow = createInputRow(urlInput);
      optionsContainer.appendChild(urlRow);

      // Alt
      const altInput = document.createElement("input");
      altInput.type = "text";
      altInput.className = "pc-eb-cta-url pc-eb-image-alt";
      altInput.placeholder = "Alt text (description)";
      styleDarkInput(altInput);
      const altRow = createInputRow(altInput);
      optionsContainer.appendChild(altRow);

      // Link
      const linkInput = document.createElement("input");
      linkInput.type = "text";
      linkInput.className = "pc-eb-cta-url pc-eb-image-link";
      linkInput.placeholder = "Link URL (optional)";
      styleDarkInput(linkInput);
      const linkRow = createInputRow(linkInput);
      optionsContainer.appendChild(linkRow);

      // Caption
      const captionInput = document.createElement("input");
      captionInput.type = "text";
      captionInput.className = "pc-eb-cta-url pc-eb-image-caption";
      captionInput.placeholder = "Caption (optional)";
      styleDarkInput(captionInput);
      const captionRow = createInputRow(captionInput);
      optionsContainer.appendChild(captionRow);

      // Add Buttons
      // URL Icon
      toolbar.appendChild(createToolbarBtn("Image Source", 
        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>', 
        "url", urlRow));
      
      // Alt Icon
      toolbar.appendChild(createToolbarBtn("Alt Text", 
        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>', 
        "alt", altRow));

      // Link Icon
      toolbar.appendChild(createToolbarBtn("Link Image", 
        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>', 
        "link", linkRow));

      // Caption Icon
      toolbar.appendChild(createToolbarBtn("Caption", 
        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>', 
        "caption", captionRow));


      // --- Controls (Width/Radius) ---
      const controlsContainer = document.createElement("div");
      controlsContainer.style.display = "flex";
      controlsContainer.style.gap = "16px";
      controlsContainer.style.marginBottom = "8px";
      
      // Width Control
      const widthContainer = document.createElement("div");
      widthContainer.style.display = "flex";
      widthContainer.style.alignItems = "center";
      widthContainer.style.gap = "8px";
      widthContainer.style.flex = "1";
      
      const widthLabel = document.createElement("label");
      widthLabel.textContent = "Width";
      widthLabel.style.fontSize = "11px";
      widthLabel.style.color = "#64748b";

      const widthSlider = document.createElement("input");
      widthSlider.type = "range";
      widthSlider.className = "pc-eb-image-width";
      widthSlider.min = "10";
      widthSlider.max = "100";
      widthSlider.value = "100";
      widthSlider.style.flex = "1";
      widthSlider.style.height = "4px";

      const widthValue = document.createElement("span");
      widthValue.textContent = "100%";
      widthValue.style.fontSize = "11px";
      widthValue.style.color = "#64748b";
      widthValue.style.minWidth = "30px";
      widthValue.style.textAlign = "right";

      widthContainer.appendChild(widthLabel);
      widthContainer.appendChild(widthSlider);
      widthContainer.appendChild(widthValue);

      // Radius Control
      const radiusContainer = document.createElement("div");
      radiusContainer.style.display = "flex";
      radiusContainer.style.alignItems = "center";
      radiusContainer.style.gap = "8px";
      radiusContainer.style.flex = "1";
      
      const radiusLabel = document.createElement("label");
      radiusLabel.textContent = "Round";
      radiusLabel.style.fontSize = "11px";
      radiusLabel.style.color = "#64748b";

      const radiusSlider = document.createElement("input");
      radiusSlider.type = "range";
      radiusSlider.className = "pc-eb-image-radius";
      radiusSlider.min = "0";
      radiusSlider.max = "24";
      radiusSlider.value = "8";
      radiusSlider.style.flex = "1";
      radiusSlider.style.height = "4px";

      const radiusValue = document.createElement("span");
      radiusValue.textContent = "8px";
      radiusValue.style.fontSize = "11px";
      radiusValue.style.color = "#64748b";
      radiusValue.style.minWidth = "25px";
      radiusValue.style.textAlign = "right";

      radiusContainer.appendChild(radiusLabel);
      radiusContainer.appendChild(radiusSlider);
      radiusContainer.appendChild(radiusValue);

      controlsContainer.appendChild(widthContainer);
      controlsContainer.appendChild(radiusContainer);


      // --- Image Preview / Upload ---
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";

      const previewWrapper = document.createElement("div");
      previewWrapper.className = "pc-eb-image-wrapper";
      previewWrapper.style.position = "relative";
      previewWrapper.style.cursor = "pointer";
      previewWrapper.style.borderRadius = "8px";
      previewWrapper.style.overflow = "hidden";
      previewWrapper.style.border = "1px solid rgba(148,163,184,0.22)";
      previewWrapper.style.backgroundColor = "rgba(148,163,184,0.12)";
      
      if (type === "image-rectangle") {
        previewWrapper.style.width = "100%";
        previewWrapper.style.aspectRatio = "3/1";
      } else {
        previewWrapper.style.minHeight = "120px";
      }

      previewWrapper.style.display = "flex";
      previewWrapper.style.alignItems = "center";
      previewWrapper.style.justifyContent = "center";

      const preview = document.createElement("img");
      preview.className = "pc-eb-image-preview";
      
      if (type === "image-rectangle") {
        preview.style.width = "100%";
        preview.style.height = "100%";
      } else {
        preview.style.maxWidth = "100%";
        preview.style.height = "auto";
      }

      preview.style.display = "block";
      preview.style.objectFit = "cover";
      preview.style.borderRadius = "8px"; // Match wrapper
      preview.src = "https://placehold.co/600x400/0b1120/e2e8f0?text=Click+to+Upload";
      
      const overlay = document.createElement("div");
      overlay.className = "pc-eb-upload-overlay";
      overlay.innerHTML = '<span style="background:rgba(0,0,0,0.6);color:#fff;padding:6px 12px;border-radius:20px;font-size:12px;backdrop-filter:blur(2px);">Click to Upload</span>';
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 0.2s";

      previewWrapper.appendChild(preview);
      previewWrapper.appendChild(overlay);

      previewWrapper.addEventListener("mouseenter", () => overlay.style.opacity = "1");
      previewWrapper.addEventListener("mouseleave", () => overlay.style.opacity = "0");
      previewWrapper.addEventListener("click", () => fileInput.click());

      // Logic
      widthSlider.addEventListener("input", function() {
        widthValue.textContent = widthSlider.value + "%";
        preview.style.width = widthSlider.value + "%";
      });
      
      radiusSlider.addEventListener("input", function() {
        radiusValue.textContent = radiusSlider.value + "px";
        preview.style.borderRadius = radiusSlider.value + "px";
      });

      urlInput.addEventListener("input", function () {
        if (urlInput.value) {
          preview.src = urlInput.value;
        } else {
          preview.src = "https://placehold.co/600x400/0b1120/e2e8f0?text=Click+to+Upload";
        }
      });

      // Upload Handler
      const statusSpan = document.createElement("span"); // Hidden but used for status if needed
      
      fileInput.addEventListener("change", function () {
        const file = fileInput.files[0];
        if (!file) return;

        // Visual feedback
        overlay.innerHTML = '<span style="color:#fff;font-size:12px;">Uploading...</span>';
        overlay.style.opacity = "1";

        const reader = new FileReader();
        reader.onload = function (e) {
          const base64 = e.target.result;
          const imageContent = base64.split(",")[1];

          fetch("/api/upload/signature-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageContent, type: "post-image" })
          })
            .then(res => {
              if (!res.ok) throw new Error("Upload failed");
              return res.json();
            })
            .then(data => {
              if (data.imageUrl) {
                urlInput.value = data.imageUrl;
                preview.src = data.imageUrl;
                // Expand URL option if hidden so user sees the result?
                // toggleOption("url", urlRow); // Maybe not needed
              }
            })
            .catch(err => {
              console.error(err);
              alert("Upload failed");
            })
            .finally(() => {
              overlay.innerHTML = '<span style="background:rgba(0,0,0,0.6);color:#fff;padding:6px 12px;border-radius:20px;font-size:12px;backdrop-filter:blur(2px);">Click to Upload</span>';
              overlay.style.opacity = "0";
            });
        };
        reader.readAsDataURL(file);
      });


      body.appendChild(optionsContainer);
      body.appendChild(controlsContainer);
      body.appendChild(previewWrapper);
      body.appendChild(fileInput);
    } else if (type === "video") {
      const label = document.createElement("div");
      label.className = "pc-eb-cta-label";
      label.contentEditable = "true";
      label.textContent = "Watch the quick video";

      const desc = document.createElement("div");
      desc.className = "pc-eb-text";
      desc.contentEditable = "true";
      desc.textContent = "Add a short description (optional).";

      const videoUrlInput = document.createElement("input");
      videoUrlInput.type = "text";
      videoUrlInput.className = "pc-eb-cta-url pc-eb-video-url";
      videoUrlInput.placeholder = "Video URL (YouTube, Vimeo, etc.)";
      videoUrlInput.style.marginBottom = "8px";

      const uploadContainer = document.createElement("div");
      uploadContainer.className = "pc-eb-image-upload";
      uploadContainer.style.marginBottom = "8px";
      uploadContainer.style.display = "flex";
      uploadContainer.style.alignItems = "center";
      uploadContainer.style.gap = "8px";

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";

      const uploadBtn = document.createElement("button");
      uploadBtn.type = "button";
      uploadBtn.textContent = "Upload Thumbnail";
      uploadBtn.style.padding = "4px 8px";
      uploadBtn.style.fontSize = "12px";
      uploadBtn.style.cursor = "pointer";
      uploadBtn.style.border = "1px solid #cbd5e1";
      uploadBtn.style.borderRadius = "4px";
      uploadBtn.style.backgroundColor = "#fff";
      uploadBtn.style.color = "#334155";

      const statusSpan = document.createElement("span");
      statusSpan.style.fontSize = "11px";
      statusSpan.style.color = "#64748b";

      const thumbUrlInput = document.createElement("input");
      thumbUrlInput.type = "text";
      thumbUrlInput.className = "pc-eb-cta-url pc-eb-video-thumb";
      thumbUrlInput.placeholder = "Thumbnail image URL (optional)";
      thumbUrlInput.style.marginBottom = "8px";

      const preview = document.createElement("img");
      preview.className = "pc-eb-image-preview";
      preview.style.maxWidth = "100%";
      preview.style.height = "auto";
      preview.style.marginTop = "8px";
      preview.style.display = "block";
      preview.style.borderRadius = "8px";
      preview.style.backgroundColor = "rgba(148,163,184,0.12)";
      preview.style.border = "1px solid rgba(148,163,184,0.22)";
      preview.style.minHeight = "100px";
      preview.style.objectFit = "cover";
      preview.src = "https://placehold.co/600x340/0b1120/e2e8f0?text=Video+Thumbnail";

      function syncThumbPreview() {
        const thumb = String(thumbUrlInput.value || "").trim();
        if (thumb) {
          preview.src = thumb;
          return;
        }
        const yt = getYouTubeId(videoUrlInput.value);
        if (yt) {
          preview.src = "https://img.youtube.com/vi/" + yt + "/hqdefault.jpg";
          return;
        }
        preview.src = "https://placehold.co/600x340/0b1120/e2e8f0?text=Video+Thumbnail";
      }

      uploadBtn.addEventListener("click", function () {
        fileInput.click();
      });

      fileInput.addEventListener("change", function () {
        const file = fileInput.files[0];
        if (!file) return;

        statusSpan.textContent = "Uploading...";
        statusSpan.style.color = "#64748b";
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = "0.7";

        const reader = new FileReader();
        reader.onload = function (e) {
          const base64 = e.target.result;
          const imageContent = base64.split(",")[1];

          fetch("/api/upload/signature-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageContent, type: "post-image" })
          })
            .then(function (res) {
              if (!res.ok) throw new Error("Upload failed");
              return res.json();
            })
            .then(function (data) {
              if (data.imageUrl) {
                thumbUrlInput.value = data.imageUrl;
                syncThumbPreview();
                statusSpan.textContent = "Done!";
                statusSpan.style.color = "#10b981";
              } else {
                throw new Error("No URL returned");
              }
            })
            .catch(function (err) {
              console.error(err);
              statusSpan.textContent = "Error";
              statusSpan.style.color = "#ef4444";
            })
            .finally(function () {
              uploadBtn.disabled = false;
              uploadBtn.style.opacity = "1";
            });
        };
        reader.readAsDataURL(file);
      });

      videoUrlInput.addEventListener("input", syncThumbPreview);
      thumbUrlInput.addEventListener("input", syncThumbPreview);

      uploadContainer.appendChild(uploadBtn);
      uploadContainer.appendChild(statusSpan);
      uploadContainer.appendChild(fileInput);

      body.appendChild(label);
      body.appendChild(desc);
      body.appendChild(videoUrlInput);
      body.appendChild(uploadContainer);
      body.appendChild(thumbUrlInput);
      body.appendChild(preview);
    } else if (type === "columns-2") {
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.gap = "10px";
      wrap.style.flexWrap = "wrap";

      function makeCol(colIndex) {
        const col = document.createElement("div");
        col.className = "pc-eb-cols-col";
        col.setAttribute("data-col", String(colIndex));
        col.style.flex = "1 1 240px";
        col.style.border = "1px solid rgba(148,163,184,0.35)";
        col.style.borderRadius = "10px";
        col.style.padding = "10px";
        col.style.background = "rgba(15,23,42,0.85)";

        const heading = document.createElement("div");
        heading.className = "pc-eb-cols-heading";
        heading.contentEditable = "true";
        heading.textContent = colIndex === 1 ? "Left column title" : "Right column title";
        heading.style.fontWeight = "600";
        heading.style.marginBottom = "6px";
        heading.style.color = "#e5e7eb";

        const desc = document.createElement("div");
        desc.className = "pc-eb-cols-desc";
        desc.contentEditable = "true";
        desc.textContent = "Add a short description.";
        desc.style.color = "#cbd5f5";
        desc.style.marginBottom = "8px";

        const uploadContainer = document.createElement("div");
        uploadContainer.className = "pc-eb-image-upload";
        uploadContainer.style.marginBottom = "8px";
        uploadContainer.style.display = "flex";
        uploadContainer.style.alignItems = "center";
        uploadContainer.style.gap = "8px";

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";

        const uploadBtn = document.createElement("button");
        uploadBtn.type = "button";
        uploadBtn.textContent = "Upload Image";
        uploadBtn.style.padding = "4px 8px";
        uploadBtn.style.fontSize = "12px";
        uploadBtn.style.cursor = "pointer";
        uploadBtn.style.border = "1px solid #cbd5e1";
        uploadBtn.style.borderRadius = "4px";
        uploadBtn.style.backgroundColor = "#fff";
        uploadBtn.style.color = "#334155";

        const statusSpan = document.createElement("span");
        statusSpan.style.fontSize = "11px";
        statusSpan.style.color = "#64748b";

        uploadBtn.addEventListener("click", function () {
          fileInput.click();
        });

        const imgUrlInput = document.createElement("input");
        imgUrlInput.type = "text";
        imgUrlInput.className = "pc-eb-cta-url pc-eb-cols-image";
        imgUrlInput.placeholder = "Image URL (optional)";
        imgUrlInput.style.marginBottom = "8px";

        const imgLinkInput = document.createElement("input");
        imgLinkInput.type = "text";
        imgLinkInput.className = "pc-eb-cta-url pc-eb-cols-link";
        imgLinkInput.placeholder = "Link URL (optional)";
        imgLinkInput.style.marginBottom = "0";

        const preview = document.createElement("img");
        preview.style.width = "100%";
        preview.style.height = "auto";
        preview.style.display = "block";
        preview.style.borderRadius = "8px";
        preview.style.backgroundColor = "rgba(148,163,184,0.12)";
        preview.style.border = "1px solid rgba(148,163,184,0.22)";
        preview.style.marginBottom = "8px";
        preview.src = "https://placehold.co/600x400/0b1120/e2e8f0?text=Optional+Image";

        imgUrlInput.addEventListener("input", function () {
          const v = String(imgUrlInput.value || "").trim();
          preview.src = v ? v : "https://placehold.co/600x400/0b1120/e2e8f0?text=Optional+Image";
        });

        fileInput.addEventListener("change", function () {
          const file = fileInput.files[0];
          if (!file) return;

          statusSpan.textContent = "Uploading...";
          statusSpan.style.color = "#64748b";
          uploadBtn.disabled = true;
          uploadBtn.style.opacity = "0.7";

          const reader = new FileReader();
          reader.onload = function (e) {
            const base64 = e.target.result;
            const imageContent = base64.split(",")[1];

            fetch("/api/upload/signature-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: imageContent, type: "post-image" })
            })
              .then(function (res) {
                if (!res.ok) throw new Error("Upload failed");
                return res.json();
              })
              .then(function (data) {
                if (data.imageUrl) {
                  imgUrlInput.value = data.imageUrl;
                  preview.src = data.imageUrl;
                  statusSpan.textContent = "Done!";
                  statusSpan.style.color = "#10b981";
                } else {
                  throw new Error("No URL returned");
                }
              })
              .catch(function (err) {
                console.error(err);
                statusSpan.textContent = "Error";
                statusSpan.style.color = "#ef4444";
              })
              .finally(function () {
                uploadBtn.disabled = false;
                uploadBtn.style.opacity = "1";
              });
          };
          reader.readAsDataURL(file);
        });

        uploadContainer.appendChild(uploadBtn);
        uploadContainer.appendChild(statusSpan);
        uploadContainer.appendChild(fileInput);

        col.appendChild(heading);
        col.appendChild(desc);
        col.appendChild(preview);
        col.appendChild(uploadContainer);
        col.appendChild(imgUrlInput);
        col.appendChild(imgLinkInput);

        return col;
      }

      wrap.appendChild(makeCol(1));
      wrap.appendChild(makeCol(2));
      body.appendChild(wrap);
    } else if (type === "spacer") {
      const label = document.createElement("div");
      label.style.fontSize = "12px";
      label.style.color = "#64748b";
      label.style.marginBottom = "4px";
      label.textContent = "Spacer height (px):";

      const heightInput = document.createElement("input");
      heightInput.type = "number";
      heightInput.className = "pc-eb-cta-url pc-eb-spacer-height";
      heightInput.placeholder = "Height (px)";
      heightInput.value = "32";
      heightInput.min = "8";
      heightInput.max = "128";

      body.appendChild(label);
      body.appendChild(heightInput);
    }

    el.appendChild(header);
    el.appendChild(body);

    el.addEventListener("focusin", function (e) {
      const target = e.target;
      if (target && target.isContentEditable) {
        state.activeEditor = target;
      }
    });

    removeBtn.addEventListener("click", function () {
      const parent = el.parentNode;
      if (parent) parent.removeChild(el);
    });

    setupDragBehavior(el);

    return el;
  }

  function setupDragBehavior(block) {
    const header = block.querySelector(".pc-eb-block-header");
    
    // Only enable draggable when hovering the header
    if (header) {
      header.addEventListener("mouseenter", function() {
        block.draggable = true;
      });
      header.addEventListener("mouseleave", function() {
        if (!block.classList.contains("pc-eb-block-dragging")) {
          block.draggable = false;
        }
      });
      // Touch support fallback
      header.addEventListener("touchstart", function() {
        block.draggable = true;
      });
    }

    block.addEventListener("dragstart", function (e) {
      block.classList.add("pc-eb-block-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        // Ensure we're dragging the block visually
        e.dataTransfer.setDragImage(block, 0, 0);
      }
    });

    block.addEventListener("dragend", function () {
      block.classList.remove("pc-eb-block-dragging");
      block.draggable = false; // Reset to safe state
    });
  }

  function getDragAfterElement(container, y) {
    const elements = Array.prototype.slice.call(container.querySelectorAll(".pc-eb-block:not(.pc-eb-block-dragging)"));
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    elements.forEach(function (child) {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset: offset, element: child };
      }
    });
    return closest.element;
  }

  function buildVariablesSidebar(sidebar) {
    const groups = {
      contact: [
        { key: "first_name", label: "First name" },
        { key: "last_name", label: "Last name" },
        { key: "full_name", label: "Full name" },
        { key: "title", label: "Title" },
        { key: "email", label: "Email" }
      ],
      account: [
        { key: "name", label: "Company" },
        { key: "website", label: "Website" },
        { key: "industry", label: "Industry" },
        { key: "city", label: "City" },
        { key: "state", label: "State" }
      ],
      sender: [
        { key: "first_name", label: "Sender first name" },
        { key: "last_name", label: "Sender last name" },
        { key: "full_name", label: "Sender full name" },
        { key: "title", label: "Sender title" },
        { key: "email", label: "Sender email" }
      ]
    };

    const tabs = document.createElement("div");
    tabs.className = "pc-eb-vars-tabs";

    const panels = document.createElement("div");
    panels.className = "pc-eb-vars-panels";

    ["contact", "account", "sender"].forEach(function (scope, index) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "pc-eb-vars-tab" + (index === 0 ? " active" : "");
      tab.setAttribute("data-scope", scope);
      tab.textContent = scope === "contact" ? "People" : scope === "account" ? "Account" : "Sender";
      tabs.appendChild(tab);

      const panel = document.createElement("div");
      panel.className = "pc-eb-vars-panel" + (index === 0 ? "" : " hidden");
      panel.setAttribute("data-scope", scope);

      groups[scope].forEach(function (item) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pc-eb-var-item";
        btn.textContent = item.label;
        btn.addEventListener("click", function () {
          insertVarIntoActiveEditor(scope, item.key, item.label);
        });
        panel.appendChild(btn);
      });

      panels.appendChild(panel);
    });

    tabs.addEventListener("click", function (e) {
      const tab = e.target.closest(".pc-eb-vars-tab");
      if (!tab) return;
      const scope = tab.getAttribute("data-scope");
      tabs.querySelectorAll(".pc-eb-vars-tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
      });
      panels.querySelectorAll(".pc-eb-vars-panel").forEach(function (p) {
        p.classList.toggle("hidden", p.getAttribute("data-scope") !== scope);
      });
    });

    sidebar.appendChild(tabs);
    sidebar.appendChild(panels);
  }

  function serializeBlocks(container, options) {
    const opts = options || {};
    const header = opts.header || {};
    const blocks = Array.prototype.slice.call(container.querySelectorAll(".pc-eb-block"));
    let subject = (header.subject || opts.subjectFallback || "Energy Solutions").trim();
    let bodyParts = [];

    blocks.forEach(function (block) {
      const type = block.getAttribute("data-block-type");
      const body = block.querySelector(".pc-eb-block-body");
      if (!body) return;

      if (type === "hero") {
        const heading = body.querySelector(".pc-eb-hero-heading");
        const sub = body.querySelector(".pc-eb-hero-sub");
        const headingHtml = tokenizedHtmlFromEl(heading);
        const subHtml = tokenizedHtmlFromEl(sub);
        if (!subject) {
          const fallback = tokenizedTextFromEl(heading);
          if (fallback) subject = fallback;
        }
        bodyParts.push('<div class="intro">' +
          (headingHtml ? '<p style="margin:0 0 12px 0;font-size:14px;color:#e5e7eb;line-height:1.6;">' + headingHtml + '</p>' : "") +
          (subHtml ? '<p style="margin:0 0 12px 0;font-size:14px;color:#e5e7eb;line-height:1.6;">' + subHtml + '</p>' : "") +
          "</div>");
      } else if (type === "text") {
        const t = body.querySelector(".pc-eb-text");
        if (t && t.innerHTML) {
          bodyParts.push('<div class="pc-eb-section"><p style="margin:0 0 12px 0;font-size:14px;color:#cbd5f5;line-height:1.6;">' + tokenizedHtmlFromEl(t) + "</p></div>");
        }
      } else if (type === "bullets") {
        const list = body.querySelector(".pc-eb-list");
        if (list) {
          const items = Array.prototype.slice.call(list.querySelectorAll("li"));
          const rows = items.map(function (li, idx) {
            const content = tokenizeHtml(li.innerHTML || "");
            const isLast = idx === items.length - 1;
            const borderStyle = isLast ? "" : "border-bottom:1px solid rgba(30,64,175,0.35);";
            return (
              '<tr>' +
              '<td width="20" valign="top" style="padding:8px 0;' + borderStyle + '">' +
              '<div style="width:6px;height:6px;border-radius:50%;background-color:#3b82f6;background:radial-gradient(circle at 30% 30%,#bfdbfe 0,#3b82f6 55%,#1e3a8a 100%);margin-top:6px;"></div>' +
              '</td>' +
              '<td valign="top" style="padding:6px 0 6px 12px;font-size:14px;color:#e5e7eb;line-height:1.5;' + borderStyle + '">' +
              content +
              '</td>' +
              '</tr>'
            );
          }).join("");
          
          bodyParts.push(
            '<div class="info-list" style="background:rgba(15,23,42,0.9);border-radius:12px;border:1px solid rgba(148,163,184,0.55);padding:14px 16px;margin:8px 0 16px 0;box-shadow:0 12px 35px rgba(15,23,42,0.7);">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' + 
            rows + 
            '</table>' +
            '</div>'
          );
        }
      } else if (type === "cta") {
        const label = body.querySelector(".pc-eb-cta-label");
        const urlInput = body.querySelector(".pc-eb-cta-url");
        const labelText = tokenizedTextFromEl(label) || "Schedule a meeting";
        let href = urlInput && urlInput.value ? urlInput.value.trim() : "https://powerchoosers.com/schedule";
        if (href && !/^(https?:|mailto:|tel:)/i.test(href)) href = "https://" + href;
        bodyParts.push(
          '<div class="cta-container" style="text-align:center;padding:18px 16px 20px 16px;background:radial-gradient(circle at top left,rgba(148,163,184,0.15),rgba(15,23,42,0.95));border-radius:14px;border:1px solid rgba(148,163,184,0.35);box-shadow:0 18px 45px rgba(15,23,42,0.45);margin:0 0 16px 0;">' +
          '<a href="' + href.replace(/"/g, "&quot;") + '" class="cta-btn" style="display:inline-block;padding:12px 30px;border-radius:999px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fefce8;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 10px 30px rgba(245,158,11,0.55);">' + labelText.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</a>" +
          '<div class="pc-eb-cta-sub" style="margin-top:8px;font-size:13px;color:#cbd5f5;opacity:.86;">Prefer email or need more info? Just reply.</div>' +
          "</div>"
        );
      } else if (type === "divider") {
        bodyParts.push('<div class="pc-eb-divider" style="height:1px;margin:14px 0;background:linear-gradient(90deg,rgba(148,163,184,0),rgba(148,163,184,0.8),rgba(148,163,184,0));"></div>');
      } else if (type === "image-regular") {
        const urlInput = body.querySelector(".pc-eb-image-url");
        const altInput = body.querySelector(".pc-eb-image-alt");
        const linkInput = body.querySelector(".pc-eb-image-link");
        const captionInput = body.querySelector(".pc-eb-image-caption");
        const widthInput = body.querySelector(".pc-eb-image-width");
        const radiusInput = body.querySelector(".pc-eb-image-radius");
        
        const url = urlInput ? urlInput.value : "";
        const alt = (altInput ? altInput.value : "") || "Image";
        const link = linkInput ? linkInput.value : "";
        const caption = captionInput ? (captionInput.value || "") : "";
        const widthVal = widthInput ? (widthInput.value || "100") : "100";
        const radiusVal = radiusInput ? (radiusInput.value || "8") : "8";

        if (url) {
          let imgHtml = '<img src="' + url.replace(/"/g, "&quot;") + '" alt="' + alt.replace(/"/g, "&quot;") + '" style="max-width:' + widthVal + '%; height:auto; border-radius:' + radiusVal + 'px; display:block; margin:0 auto;">';
          if (link) {
            imgHtml = '<a href="' + link.replace(/"/g, "&quot;") + '" target="_blank">' + imgHtml + '</a>';
          }
          bodyParts.push(
            '<div class="pc-eb-image-container" style="padding:12px 0; text-align:center;">' +
            imgHtml +
            (String(caption || "").trim() ? '<div style="margin-top:8px;font-size:13px;line-height:1.45;color:#94a3b8;">' + escapeHtml(caption.trim()) + '</div>' : "") +
            '</div>'
          );
        }
      } else if (type === "image-rectangle") {
        const urlInput = body.querySelector(".pc-eb-image-url");
        const altInput = body.querySelector(".pc-eb-image-alt");
        const linkInput = body.querySelector(".pc-eb-image-link");
        const captionInput = body.querySelector(".pc-eb-image-caption");
        const widthInput = body.querySelector(".pc-eb-image-width");
        const radiusInput = body.querySelector(".pc-eb-image-radius");

        const url = urlInput ? urlInput.value : "";
        const alt = (altInput ? altInput.value : "") || "Image";
        const link = linkInput ? linkInput.value : "";
        const caption = captionInput ? (captionInput.value || "") : "";
        const widthVal = widthInput ? (widthInput.value || "100") : "100";
        const radiusVal = radiusInput ? (radiusInput.value || "8") : "8";

        if (url) {
          let imgHtml = '<img src="' + url.replace(/"/g, "&quot;") + '" alt="' + alt.replace(/"/g, "&quot;") + '" style="width:' + widthVal + '%; height:auto; border-radius:' + radiusVal + 'px; display:block; margin:0 auto;">';
          if (link) {
            imgHtml = '<a href="' + link.replace(/"/g, "&quot;") + '" target="_blank">' + imgHtml + '</a>';
          }
          bodyParts.push(
            '<div class="pc-eb-image-full" style="margin:12px 0; text-align:center;">' +
            imgHtml +
            (String(caption || "").trim() ? '<div style="margin-top:8px;font-size:13px;line-height:1.45;color:#94a3b8;">' + escapeHtml(caption.trim()) + '</div>' : "") +
            '</div>'
          );
        }
      } else if (type === "video") {
        const label = body.querySelector(".pc-eb-cta-label");
        const desc = body.querySelector(".pc-eb-text");
        const videoUrlInput = body.querySelector(".pc-eb-video-url");
        const thumbUrlInput = body.querySelector(".pc-eb-video-thumb");
        const rawVideoUrl = videoUrlInput ? (videoUrlInput.value || "") : "";
        const videoUrl = normalizeHref(rawVideoUrl);
        const thumbUrlRaw = thumbUrlInput ? (thumbUrlInput.value || "") : "";
        const yt = getYouTubeId(videoUrl);
        const thumbUrl = String(thumbUrlRaw || "").trim() || (yt ? ("https://img.youtube.com/vi/" + yt + "/hqdefault.jpg") : "");
        const labelHtml = tokenizedHtmlFromEl(label);
        const descHtml = tokenizedHtmlFromEl(desc);

        if (videoUrl) {
          const imgSrc = thumbUrl ? thumbUrl : "https://placehold.co/600x340/0b1120/e2e8f0?text=Video";
          bodyParts.push(
            '<div style="margin:12px 0; text-align:center;">' +
            (labelHtml ? '<div style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#e5e7eb;">' + labelHtml + '</div>' : "") +
            (descHtml ? '<div style="margin:0 0 10px 0;font-size:14px;line-height:1.55;color:#cbd5f5;">' + descHtml + '</div>' : "") +
            '<a href="' + escapeAttr(videoUrl) + '" target="_blank" style="text-decoration:none;">' +
            '<img src="' + escapeAttr(imgSrc) + '" alt="Video" style="max-width:100%; height:auto; border-radius:10px; display:block; margin:0 auto;">' +
            '</a>' +
            '<div style="margin-top:8px;font-size:13px;color:#94a3b8;">Click to watch</div>' +
            '</div>'
          );
        }
      } else if (type === "columns-2") {
        const cols = Array.prototype.slice.call(body.querySelectorAll(".pc-eb-cols-col"));

        function serializeCol(col) {
          const heading = col ? col.querySelector(".pc-eb-cols-heading") : null;
          const desc = col ? col.querySelector(".pc-eb-cols-desc") : null;
          const imgUrlInput = col ? col.querySelector(".pc-eb-cols-image") : null;
          const linkInput = col ? col.querySelector(".pc-eb-cols-link") : null;
          const imgUrl = imgUrlInput ? String(imgUrlInput.value || "").trim() : "";
          const href = linkInput ? normalizeHref(linkInput.value) : "";

          const headingHtml = tokenizedHtmlFromEl(heading);
          const descHtml = tokenizedHtmlFromEl(desc);

          let imgHtml = "";
          if (imgUrl) {
            const img = '<img src="' + escapeAttr(imgUrl) + '" alt="" style="max-width:100%; height:auto; border-radius:10px; display:block;">';
            imgHtml = href ? ('<a href="' + escapeAttr(href) + '" target="_blank" style="text-decoration:none;">' + img + '</a>') : img;
            imgHtml = '<div style="margin:0 0 10px 0;">' + imgHtml + '</div>';
          }

          return (
            imgHtml +
            (headingHtml ? '<div style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#e5e7eb;">' + headingHtml + '</div>' : "") +
            (descHtml ? '<div style="margin:0;font-size:14px;line-height:1.55;color:#cbd5f5;">' + descHtml + '</div>' : "")
          );
        }

        const left = serializeCol(cols[0]);
        const right = serializeCol(cols[1]);

        if (left || right) {
          bodyParts.push(
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;">' +
            '<tr>' +
            '<td width="50%" valign="top" style="padding:0 8px 0 0;">' + (left || "") + '</td>' +
            '<td width="50%" valign="top" style="padding:0 0 0 8px;">' + (right || "") + '</td>' +
            '</tr>' +
            '</table>'
          );
        }
      } else if (type === "spacer") {
        const heightInput = body.querySelector(".pc-eb-spacer-height");
        const height = heightInput ? (heightInput.value || "32") : "32";
        bodyParts.push('<div class="pc-eb-spacer" style="height:' + height + 'px; line-height:' + height + 'px; font-size:0;">&nbsp;</div>');
      }
    });

    const contentHtml = bodyParts.join("\n");

    const settings = (window.SettingsPage && typeof window.SettingsPage.getSettings === "function") ? window.SettingsPage.getSettings() : {};
    const g = settings && settings.general ? settings.general : {};
    const senderName = g.firstName && g.lastName ? (g.firstName + " " + g.lastName).trim() : (g.agentName || "Power Choosers Team");
    const senderTitle = g.title || g.jobTitle || "Energy Strategist";
    const senderCompany = g.companyName || "Power Choosers";
    const senderLocation = g.location || "Fort Worth, TX";
    const senderPhone = g.phone || "+1 (817) 809-3367";
    const senderEmail = g.email || "";
    const senderLinkedIn = normalizeHref(g.linkedIn) || "https://www.linkedin.com/company/power-choosers";
    const senderAvatar = g.hostedPhotoURL || g.photoURL || "";

    const headerLogoUrl = header.logoUrl || "https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png";
    const headerPillText = (header.pillText || "2026 ENERGY MARKET UPDATE").trim();
    const headerSubline = (header.subline || "Signals from the next 6–12 months, translated into simple decisions.").trim();

    const html =
      "<!DOCTYPE html>" +
      '<html lang="en">' +
      "<head>" +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<style>' +
      '@media (min-width: 640px) {' +
      '.pc-eb-bg { padding: 32px !important; }' +
      '.header { padding: 32px 32px 24px 32px !important; }' +
      '.body-wrap { padding: 32px 32px 32px 32px !important; }' +
      '.footer { padding: 20px 32px 32px 32px !important; }' +
      '}' +
      '</style>' +
      "</head>" +
      '<body data-html-builder="true" style="margin:0;padding:0;background:#020617;font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;color:#0f172a;">' +
      '<div class="pc-eb-bg" style="min-height:100%;padding:16px 12px;background:radial-gradient(circle at top,#334155 0,#0f172a 52%);">' +
      '<div class="container" style="max-width:640px;margin:0 auto;background:rgba(15,23,42,0.96);border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,0.65);overflow:hidden;border:1px solid rgba(148,163,184,0.35);">' +
      '<div class="header" style="padding:24px 20px 16px 20px;background:radial-gradient(circle at 0 0,#22c55e 0,#16a34a 32%,#0b1120 90%);color:#ecfeff;text-align:left;position:relative;">' +
      '<img class="header-logo" src="' + headerLogoUrl.replace(/"/g, "&quot;") + '" alt="Power Choosers" style="max-width:180px;display:block;margin-bottom:6px;">' +
      '<div class="header-pill" style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(15,23,42,0.35);backdrop-filter:blur(18px);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#e5e7eb;">' +
      '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>' +
      '<td valign="middle" style="padding-right:8px;"><span style="display:block;width:7px;height:7px;border-radius:999px;background:radial-gradient(circle at 30% 30%,#bbf7d0 0,#22c55e 55%,#14532d 100%);box-shadow:0 0 0 4px rgba(34,197,94,0.35);"></span></td>' +
      '<td valign="middle" style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#e5e7eb;line-height:1;">' + headerPillText.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</td>' +
      '</tr></table>' +
      '</div>' +
      '<div class="subject-blurb" style="margin:18px 0 4px 0;font-size:14px;font-weight:600;letter-spacing:.03em;color:#dbeafe;">' + subject.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</div>" +
      '<div class="header-sub" style="font-size:12px;color:rgba(226,232,240,0.76);">' + headerSubline.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</div>" +
      "</div>" +
      '<div class="body-wrap" style="padding:20px 16px 20px 16px;background:radial-gradient(circle at top,#0b1120 0,#020617 60%);">' +
      contentHtml +
      `<div style="margin-top: 8px; padding-top: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <!-- Orange gradient divider -->
            <div style="height: 2px; background: linear-gradient(to right, #f59e0b 0%, #f59e0b 40%, transparent 100%); margin-bottom: 24px;"></div>

            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; width: auto;">
                <tr>
                    <td style="vertical-align: top; padding-right: 10px; width: 64px;">
                        ${senderAvatar ? `
                        <div style="position: relative; width: 56px; height: 56px;">
                            <div style="position: absolute; inset: 0; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 50%; opacity: 0.1;"></div>
                            <img src="${senderAvatar.replace(/"/g, '&quot;')}" 
                                 alt="${senderName.replace(/"/g, '&quot;')}" 
                                 width="56" 
                                 height="56" 
                                 style="position: relative; z-index: 1; border-radius: 50%; border: 2px solid #f59e0b; display: block; object-fit: cover;">
                        </div>
                        ` : `
                        <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; font-weight: 600;">
                            ${senderName.charAt(0).toUpperCase()}
                        </div>
                        `}
                    </td>
                    <td style="vertical-align: top; padding-left: 0;">
                        <div style="font-size: 16px; font-weight: 600; color: #f8fafc; margin-bottom: 2px; letter-spacing: -0.3px;">
                            ${senderName.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                        </div>
                        <div style="font-size: 13px; font-weight: 500; color: #f59e0b; margin-bottom: 4px; letter-spacing: 0.3px;">
                            ${senderTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                        </div>
                        <div style="font-size: 12px; font-weight: 500; color: #cbd5e1; letter-spacing: 0.5px; margin-bottom: 6px;">
                            ${senderCompany.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                        </div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding-top: 4px;">
                        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12px; color: #94a3b8; width: auto;">
                            <tr>
                                <td style="padding: 3px 8px 3px 0; color: #94a3b8; font-weight: 500; min-width: 52px;">Phone</td>
                                <td style="padding: 3px 0;">
                                    <a href="tel:${senderPhone.replace(/[^\d+]/g, '')}" style="color: #e2e8f0; text-decoration: none; white-space: nowrap;">${senderPhone.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 8px 3px 0; color: #94a3b8; font-weight: 500; white-space: nowrap;">Email</td>
                                <td style="padding: 3px 0;">
                                    <a href="mailto:${senderEmail}" style="color: #e2e8f0; text-decoration: none; white-space: nowrap;">${senderEmail}</a>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 8px 3px 0; color: #94a3b8; font-weight: 500;">Location</td>
                                <td style="padding: 3px 0; color: #e2e8f0;">${senderLocation.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
                            </tr>
                        </table>
                        <div style="border-top: 1px solid #334155; padding-top: 8px; margin-top: 6px;">
                            <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; width: auto; white-space: nowrap;">
                                <tr>
                                    <td style="padding: 4px 12px 4px 0;">
                                        <a href="${senderLinkedIn}" target="_blank" style="font-size: 11px; font-weight: 500; color: #cbd5e1; text-decoration: none; display: inline-block;">
                                            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;">
                                                <tr>
                                                    <td style="vertical-align: middle; padding-right: 8px;">
                                                        <img src="https://img.icons8.com/ios-filled/16/e2e8f0/linkedin.png" width="14" height="14" alt="" style="display: block;">
                                                    </td>
                                                    <td style="vertical-align: middle; line-height: 14px; color: #cbd5e1;">LinkedIn</td>
                                                </tr>
                                            </table>
                                        </a>
                                    </td>
                                    <td style="padding: 4px 12px 4px 0;">
                                        <a href="https://powerchoosers.com" target="_blank" style="font-size: 11px; font-weight: 500; color: #cbd5e1; text-decoration: none; display: inline-block;">
                                            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;">
                                                <tr>
                                                    <td style="vertical-align: middle; padding-right: 8px;">
                                                        <img src="https://img.icons8.com/ios-filled/16/e2e8f0/domain.png" width="14" height="14" alt="" style="display: block;">
                                                    </td>
                                                    <td style="vertical-align: middle; line-height: 14px; color: #cbd5e1;">Website</td>
                                                </tr>
                                            </table>
                                        </a>
                                    </td>
                                    <td style="padding: 4px 0;">
                                        <a href="https://powerchoosers.com/schedule" target="_blank" style="font-size: 11px; font-weight: 500; color: #cbd5e1; text-decoration: none; display: inline-block;">
                                            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;">
                                                <tr>
                                                    <td style="vertical-align: middle; padding-right: 8px;">
                                                        <img src="https://img.icons8.com/ios-filled/16/e2e8f0/calendar--v1.png" width="14" height="14" alt="" style="display: block;">
                                                    </td>
                                                    <td style="vertical-align: middle; line-height: 14px; color: #cbd5e1;">Schedule</td>
                                                </tr>
                                            </table>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>
        </div>` +
      '<div class="footer" style="padding:12px 16px 16px 16px;color:#6b7280;font-size:11px;text-align:center;background:transparent;letter-spacing:.18em;text-transform:uppercase;">POWER CHOOSERS · YOUR ENERGY PARTNER</div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</body>" +
      "</html>";

    return { html: html, subject: subject };
  }

  function prefillFromHtml(blocksContainer, headerEls, initialHtml) {
    if (!initialHtml) return;
    const trimmed = String(initialHtml).trim();
    if (!trimmed) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "text/html");

    // Check if this is likely a Power Choosers Builder email
    const isPCEmail = doc.querySelector(".pc-eb-bg") || doc.querySelector(".header-pill") || doc.querySelector(".header-logo") || doc.querySelector(".container");

    const pill = doc.querySelector(".header-pill span:last-child") || doc.querySelector(".header-pill span");
    const subject = doc.querySelector(".subject-blurb");
    const subline = doc.querySelector(".header-sub");
    const logo = doc.querySelector(".header-logo");

    if (headerEls) {
      if (headerEls.pillTextEl && pill && pill.textContent) headerEls.pillTextEl.textContent = pill.textContent.trim();
      if (headerEls.subjectEl && subject && subject.textContent) headerEls.subjectEl.textContent = subject.textContent.trim();
      if (headerEls.sublineEl && subline && subline.textContent) headerEls.sublineEl.textContent = subline.textContent.trim();
      if (headerEls.logoEl && logo && logo.getAttribute("src")) headerEls.logoEl.src = logo.getAttribute("src");
    }

    // Try to find the content wrapper. Priority: .body-wrap > .container > .pc-eb-bg > body
    let bodyWrap = doc.querySelector(".body-wrap");
    if (!bodyWrap && isPCEmail) {
      bodyWrap = doc.querySelector(".container") || doc.querySelector(".pc-eb-bg");
    }
    if (!bodyWrap) bodyWrap = isPCEmail ? null : doc.body;

    if (!bodyWrap) {
        // Fallback for plain text inputs (non-PC emails) if we can't find a wrapper but IS PC email
        // Actually, if IS PC email but no wrapper found, we might have a broken snippet.
        // Try to recover content from body if possible, or abort to avoid nesting.
        if (isPCEmail && doc.body && doc.body.textContent.trim()) {
             // Treat as text fallback
             const block = createBlock("text");
             const body = block.querySelector(".pc-eb-block-body .pc-eb-text") || block.querySelector(".pc-eb-text");
             if (body) body.innerHTML = trimmed;
             blocksContainer.appendChild(block);
             return;
        }
        return; 
    }

    const children = Array.prototype.slice.call(bodyWrap.children || []);
    let added = false;

    children.forEach(function (child) {
      if (!child) return;
      if (child.classList && (child.classList.contains("signature") || child.classList.contains("footer"))) return;

      // Skip structural elements to avoid nesting
      if (child.classList && (child.classList.contains("pc-eb-bg") || child.classList.contains("container") || child.classList.contains("header"))) return;

      // Also skip if it's a wrapper div with no class but contains recognized structures
      if (child.tagName === 'DIV' && !child.className && (child.querySelector('.pc-eb-bg') || child.querySelector('.container'))) return;

      if (child.classList && child.classList.contains("intro")) {
        const ps = Array.prototype.slice.call(child.querySelectorAll("p"));
        const hero = createBlock("hero");
        const heading = hero.querySelector(".pc-eb-hero-heading");
        const sub = hero.querySelector(".pc-eb-hero-sub");
        if (heading && ps[0]) heading.innerHTML = ps[0].innerHTML || "";
        if (sub && ps[1]) sub.innerHTML = ps[1].innerHTML || "";
        blocksContainer.appendChild(hero);
        added = true;
        return;
      }

      if (child.classList && child.classList.contains("pc-eb-section")) {
        const p = child.querySelector("p");
        const text = createBlock("text");
        const t = text.querySelector(".pc-eb-text");
        if (t) t.innerHTML = (p ? p.innerHTML : child.innerHTML) || "";
        blocksContainer.appendChild(text);
        added = true;
        return;
      }

      if (child.classList && child.classList.contains("info-list")) {
        const bullets = createBlock("bullets");
        const ul = bullets.querySelector(".pc-eb-list");
        const items = Array.prototype.slice.call(child.querySelectorAll("li"));
        if (ul) {
          ul.innerHTML = "";
          items.forEach(function (li) {
            const n = document.createElement("li");
            n.contentEditable = "true";
            n.innerHTML = li.innerHTML || "";
            ul.appendChild(n);
          });
        }
        blocksContainer.appendChild(bullets);
        added = true;
        return;
      }

      if (child.classList && child.classList.contains("cta-container")) {
        const cta = createBlock("cta");
        const label = cta.querySelector(".pc-eb-cta-label");
        const url = cta.querySelector(".pc-eb-cta-url");
        const link = child.querySelector("a");
        if (label && link) label.textContent = (link.textContent || "").trim();
        if (url && link && link.getAttribute("href")) url.value = link.getAttribute("href");
        blocksContainer.appendChild(cta);
        added = true;
        return;
      }

      if (child.classList && child.classList.contains("pc-eb-divider")) {
        blocksContainer.appendChild(createBlock("divider"));
        added = true;
        return;
      }

      // If we are parsing a PC email, do NOT fallback to wrapping unknown blocks in text
      if (isPCEmail) {
        // Only treat as text if it looks like a paragraph or div with content, but not a huge container
        // Also allow divs that might have nested spans/links but NOT block-level containers
        const hasBlockChildren = child.querySelector('div') || child.querySelector('table') || child.querySelector('section');
        if (child.tagName === 'P' || (child.tagName === 'DIV' && !child.className && !hasBlockChildren)) {
             const fallback = createBlock("text");
             const t = fallback.querySelector(".pc-eb-text");
             if (t) t.innerHTML = child.outerHTML || child.innerHTML || "";
             blocksContainer.appendChild(fallback);
             added = true;
        }
        return;
      }

      const fallback = createBlock("text");
      const t = fallback.querySelector(".pc-eb-text");
      if (t) t.innerHTML = child.outerHTML || child.innerHTML || "";
      blocksContainer.appendChild(fallback);
      added = true;
    });

    if (!added && !isPCEmail) {
      const block = createBlock("text");
      const body = block.querySelector(".pc-eb-block-body .pc-eb-text") || block.querySelector(".pc-eb-text");
      if (body) {
        body.innerHTML = bodyWrap.innerHTML || trimmed;
      }
      blocksContainer.appendChild(block);
    }
  }

  function openOverlay(options) {
    const opts = options || {};
    closeOverlay();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay modal-overlay--animated show pc-email-builder-overlay pc-email-builder-preparing";

    const modal = document.createElement("div");
    modal.className = "step-type-modal pc-email-builder-modal";

    const header = document.createElement("div");
    header.className = "pc-email-builder-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "pc-email-builder-title-wrap";

    const title = document.createElement("div");
    title.className = "pc-email-builder-title";
    title.textContent = "Design HTML email";

    const subtitle = document.createElement("div");
    subtitle.className = "pc-email-builder-subtitle";
    subtitle.textContent = "Drag blocks, personalize with variables, and generate a 2026-ready layout.";

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const headerActions = document.createElement("div");
    headerActions.className = "pc-email-builder-header-actions";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "pc-email-builder-close";
    closeBtn.setAttribute("aria-label", "Close builder");
    closeBtn.textContent = "×";

    headerActions.appendChild(closeBtn);
    header.appendChild(titleWrap);
    header.appendChild(headerActions);

    const main = document.createElement("div");
    main.className = "pc-email-builder-main";

    const sidebar = document.createElement("div");
    sidebar.className = "pc-email-builder-sidebar";

    const sidebarBlocksTitle = document.createElement("div");
    sidebarBlocksTitle.className = "pc-email-builder-sidebar-title";
    sidebarBlocksTitle.textContent = "Blocks";

    let preview;

    const blockList = document.createElement("div");
    blockList.className = "pc-email-builder-block-list";
    getBlockDefs().forEach(function (def) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pc-email-builder-block-btn";
      btn.setAttribute("data-block-type", def.id);

      const icon = document.createElement("span");
      icon.className = "pc-eb-block-icon";
      icon.innerHTML = getBlockIconSvg(def.id);

      const label = document.createElement("span");
      label.className = "pc-eb-block-label";
      label.textContent = def.label;

      btn.appendChild(icon);
      btn.appendChild(label);

      btn.addEventListener("click", function () {
        const block = createBlock(def.id);
        if (preview && preview.blocksContainer) {
          preview.blocksContainer.appendChild(block);
        }
      });
      blockList.appendChild(btn);
    });

    const sidebarVarsTitle = document.createElement("div");
    sidebarVarsTitle.className = "pc-email-builder-sidebar-title pc-email-builder-sidebar-title-vars";
    sidebarVarsTitle.textContent = "Variables";

    const varsContainer = document.createElement("div");
    varsContainer.className = "pc-email-builder-vars";
    buildVariablesSidebar(varsContainer);

    sidebar.appendChild(sidebarBlocksTitle);
    sidebar.appendChild(blockList);
    sidebar.appendChild(sidebarVarsTitle);
    sidebar.appendChild(varsContainer);

    const canvas = document.createElement("div");
    canvas.className = "pc-email-builder-canvas";

    const canvasInner = document.createElement("div");
    canvasInner.className = "pc-email-builder-canvas-inner";

    preview = buildEmailPreviewFrame({
      subject: opts.subject || "",
      pillText: "2026 ENERGY MARKET UPDATE",
      subline: "Signals from the next 6–12 months, translated into simple decisions."
    });

    canvasInner.appendChild(preview.root);
    canvas.appendChild(canvasInner);

    main.appendChild(sidebar);
    main.appendChild(canvas);

    const footer = document.createElement("div");
    footer.className = "pc-email-builder-footer";

    const leftFooter = document.createElement("div");
    leftFooter.className = "pc-email-builder-footer-left";
    const hint = document.createElement("div");
    hint.className = "pc-email-builder-hint";
    hint.textContent = "Drag blocks to reorder. Variables render using your contact and account data.";
    leftFooter.appendChild(hint);

    const rightFooter = document.createElement("div");
    rightFooter.className = "pc-email-builder-footer-right";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "pc-email-builder-btn pc-email-builder-btn-secondary";
    cancelBtn.textContent = "Cancel";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "pc-email-builder-btn pc-email-builder-btn-primary";
    applyBtn.textContent = "Use in email";

    rightFooter.appendChild(cancelBtn);
    rightFooter.appendChild(applyBtn);

    footer.appendChild(leftFooter);
    footer.appendChild(rightFooter);

    modal.appendChild(header);
    modal.appendChild(main);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    document.body.appendChild(overlay);

    state.overlay = overlay;

    requestAnimationFrame(function () {
      if (!state.overlay) return;
      overlay.classList.remove("pc-email-builder-preparing");
      overlay.classList.add("pc-email-builder-ready");
    });

    overlay.addEventListener("focusin", function (e) {
      const target = e.target;
      if (target && target.isContentEditable) {
        state.activeEditor = target;
      }
    });

    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S")) {
        e.preventDefault();
        applyBtn.click();
      }
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        closeOverlay();
      }
    });

    closeBtn.addEventListener("click", function () {
      closeOverlay();
    });

    cancelBtn.addEventListener("click", function () {
      closeOverlay();
    });

    preview.blocksContainer.addEventListener("dragover", function (e) {
      e.preventDefault();

      // Auto-scroll logic
      const canvas = preview.blocksContainer.closest(".pc-email-builder-canvas");
      if (canvas) {
        const threshold = 120; // Distance from edge to start scrolling
        const speed = 15; // Scroll speed
        const rect = canvas.getBoundingClientRect();
        
        // Scroll up if near top
        if (e.clientY < rect.top + threshold) {
          canvas.scrollTop -= speed;
        } 
        // Scroll down if near bottom
        else if (e.clientY > rect.bottom - threshold) {
          canvas.scrollTop += speed;
        }
      }

      const afterElement = getDragAfterElement(preview.blocksContainer, e.clientY);
      const dragging = preview.blocksContainer.querySelector(".pc-eb-block-dragging");
      if (!dragging) return;
      if (!afterElement) {
        preview.blocksContainer.appendChild(dragging);
      } else {
        preview.blocksContainer.insertBefore(dragging, afterElement);
      }
    });

    if (opts.initialHtml) {
      prefillFromHtml(preview.blocksContainer, preview.header, opts.initialHtml);
    } else {
      const hero = createBlock("hero");
      preview.blocksContainer.appendChild(hero);
      const bullets = createBlock("bullets");
      preview.blocksContainer.appendChild(bullets);
      const cta = createBlock("cta");
      preview.blocksContainer.appendChild(cta);
    }

    if (!preview.header.subjectEl.textContent.trim()) {
      preview.header.subjectEl.textContent = opts.subject || "";
    }

    applyBtn.addEventListener("click", function () {
      const result = serializeBlocks(preview.blocksContainer, {
        subjectFallback: opts.subject,
        header: {
          logoUrl: preview.header.logoEl ? preview.header.logoEl.getAttribute("src") : "",
          pillText: tokenizedTextFromEl(preview.header.pillTextEl),
          subject: tokenizedTextFromEl(preview.header.subjectEl),
          subline: tokenizedTextFromEl(preview.header.sublineEl)
        }
      });

      if (opts && typeof opts.onSave === "function") {
        try {
          opts.onSave(result);
        } catch (e) {
          console.error('[EmailBuilder] onSave error:', e);
        }
      } else {
        console.warn('[EmailBuilder] No onSave function provided');
      }
      closeOverlay();
    });

    const firstEditable = overlay.querySelector("[contenteditable='true']");
    if (firstEditable) {
      firstEditable.focus();
      state.activeEditor = firstEditable;
    }
  }

  window.PCEmailBuilder.open = function (options) {
    openOverlay(options || {});
  };

  window.PCEmailBuilder.close = function () {
    closeOverlay();
  };
})();
