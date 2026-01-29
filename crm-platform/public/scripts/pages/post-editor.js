'use strict';

// Post Editor Modal - Handles creating and editing news posts
(function () {
  let currentPostId = null;
  let insertedImages = [];

  function initDomRefs() {
    return {
      modal: document.getElementById('modal-create-post'),
      form: document.getElementById('form-create-post'),
      title: document.getElementById('create-post-title'),
      titleInput: document.getElementById('post-title'),
      slugInput: document.getElementById('post-slug'),
      categoryInput: document.getElementById('post-category'),
      statusSelect: document.getElementById('post-status'),
      metaDescInput: document.getElementById('post-meta-description'),
      keywordsInput: document.getElementById('post-keywords'),
      publishDateInput: document.getElementById('post-publish-date'),
      featuredImageInput: document.getElementById('post-featured-image'),
      featuredImageFileInput: document.getElementById('featured-image-file-input'),
      featuredImageUrlInput: document.getElementById('featured-image-url-input'),
      uploadFeaturedBtn: document.getElementById('upload-featured-image-btn'),
      featuredImagePreview: document.getElementById('featured-image-preview'),
      featuredImagePreviewImg: document.getElementById('featured-image-preview-img'),
      removeFeaturedBtn: document.getElementById('remove-featured-image'),
      editor: document.getElementById('post-content-editor'),
      toolbar: document.querySelector('.rich-text-toolbar'),
      insertImageBtn: document.getElementById('insert-image-btn'),
      insertedImagesSection: document.getElementById('inserted-images-section'),
      insertedImagesList: document.getElementById('inserted-images-list'),
      saveDraftBtn: document.getElementById('save-draft-btn'),
      publishBtn: document.getElementById('publish-post-btn'),
      aiGenerateBtn: document.getElementById('ai-generate-post-btn')
    };
  }

  // Generate slug from title
  function generateSlug(title) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Auto-generate slug from title
  function setupSlugGeneration(els) {
    if (!els.titleInput || !els.slugInput) return;

    let isManualSlug = false;

    els.titleInput.addEventListener('input', () => {
      if (!isManualSlug && els.slugInput.value === '') {
        els.slugInput.value = generateSlug(els.titleInput.value);
      }
    });

    els.slugInput.addEventListener('input', () => {
      isManualSlug = els.slugInput.value !== '';
    });

    els.slugInput.addEventListener('focus', () => {
      isManualSlug = true;
    });
  }

  // Rich Text Editor Toolbar
  function setupRichTextEditor(els) {
    if (!els.editor || !els.toolbar) return;

    // Toolbar button handlers
    els.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;

      e.preventDefault();
      const command = btn.getAttribute('data-command');
      const value = btn.getAttribute('data-value');

      els.editor.focus();

      if (command === 'createLink') {
        insertLink(els.editor);
      } else if (command === 'formatBlock' && value) {
        document.execCommand('formatBlock', false, value);
      } else if (command) {
        document.execCommand(command, false, null);
      }
    });

    // Insert image button
    if (els.insertImageBtn) {
      els.insertImageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        insertImage(els);
      });
    }

    // Handle paste events to clean up pasted content
    els.editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    // Update toolbar button states based on selection
    els.editor.addEventListener('selectionchange', () => {
      updateToolbarState(els.toolbar);
    });
  }

  function updateToolbarState(toolbar) {
    if (!toolbar) return;

    const commands = ['bold', 'italic', 'underline'];
    commands.forEach(cmd => {
      const btn = toolbar.querySelector(`[data-command="${cmd}"]`);
      if (btn) {
        try {
          const isActive = document.queryCommandState(cmd);
          btn.classList.toggle('active', isActive);
        } catch (e) {
          // Ignore errors
        }
      }
    });
  }

  function insertLink(editor) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    // Create link input dialog
    const dialog = document.createElement('div');
    dialog.className = 'link-input-dialog';
    dialog.innerHTML = `
      <input type="url" id="link-url-input" placeholder="Enter URL..." value="${selectedText.startsWith('http') ? selectedText : ''}" />
      <div class="link-actions">
        <button type="button" class="btn-text" id="link-cancel">Cancel</button>
        <button type="button" class="btn-primary" id="link-insert">Insert</button>
      </div>
    `;

    // Position dialog
    const rect = range.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.top = `${rect.bottom + 10}px`;
    dialog.style.left = `${rect.left}px`;

    document.body.appendChild(dialog);

    const urlInput = dialog.querySelector('#link-url-input');
    const insertBtn = dialog.querySelector('#link-insert');
    const cancelBtn = dialog.querySelector('#link-cancel');

    urlInput.focus();
    if (!selectedText.startsWith('http')) {
      urlInput.select();
    }

    const cleanup = () => {
      document.body.removeChild(dialog);
    };

    insertBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        if (selectedText) {
          document.execCommand('createLink', false, url);
        } else {
          document.execCommand('insertText', false, url);
          const newRange = window.getSelection().getRangeAt(0);
          document.execCommand('createLink', false, url);
        }
      }
      cleanup();
    });

    cancelBtn.addEventListener('click', cleanup);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        insertBtn.click();
      } else if (e.key === 'Escape') {
        cleanup();
      }
    });

    // Close on outside click
    setTimeout(() => {
      const closeOnClick = (e) => {
        if (!dialog.contains(e.target)) {
          cleanup();
          document.removeEventListener('click', closeOnClick);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOnClick), 0);
    }, 0);
  }

  async function insertImage(els) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Check file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Image file too large. Please choose a file under 5MB.', 'error');
        }
        return;
      }

      try {
        // Show uploading state
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Uploading image...', 'info');
        }

        // Convert to base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Upload to Imgur
        const apiBase = window.location.hostname === 'localhost'
          ? 'http://localhost:3000'
          : 'https://power-choosers-crm-792458658491.us-central1.run.app';

        const response = await fetch(`${apiBase}/api/upload/signature-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, type: 'post-image' })
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const result = await response.json();
        if (!result.success || !result.imageUrl) {
          throw new Error('Upload failed');
        }

        // Insert image into editor
        const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-with-caption';
        imageContainer.dataset.imageId = imageId;

        const img = document.createElement('img');
        img.src = result.imageUrl;
        img.alt = file.name;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '1rem auto';
        img.style.borderRadius = 'var(--border-radius)';

        const caption = document.createElement('div');
        caption.className = 'image-caption';
        caption.contentEditable = true;
        caption.dataset.placeholder = 'Add caption...';
        caption.style.minHeight = '24px';
        caption.style.padding = '4px 8px';

        // Add placeholder behavior
        caption.addEventListener('focus', function () {
          if (this.textContent.trim() === '') {
            this.textContent = '';
          }
        });

        caption.addEventListener('blur', function () {
          if (this.textContent.trim() === '') {
            this.textContent = '';
          }
        });

        imageContainer.appendChild(img);
        imageContainer.appendChild(caption);

        // Insert at cursor position
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(imageContainer);

          // Move cursor after image
          range.setStartAfter(imageContainer);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          els.editor.appendChild(imageContainer);
        }

        // Store image info
        insertedImages.push({
          id: imageId,
          url: result.imageUrl,
          caption: ''
        });

        updateInsertedImagesList(els);

        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Image uploaded successfully', 'success');
        }
      } catch (error) {
        console.error('[Post Editor] Image upload error:', error);
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Failed to upload image', 'error');
        }
      }
    });

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }

  function updateInsertedImagesList(els) {
    if (!els.insertedImagesList || !els.insertedImagesSection) return;

    if (insertedImages.length === 0) {
      els.insertedImagesSection.style.display = 'none';
      return;
    }

    els.insertedImagesSection.style.display = 'block';
    els.insertedImagesList.innerHTML = insertedImages.map((img, index) => `
      <div class="inserted-image-item" data-image-id="${img.id}">
        <img src="${img.url}" alt="Image ${index + 1}" />
        <input type="text" class="image-caption-input" placeholder="Image caption..." value="${img.caption || ''}" data-image-id="${img.id}" />
        <div class="image-actions">
          <button type="button" class="btn-text" data-remove-image="${img.id}">Remove</button>
        </div>
      </div>
    `).join('');

    // Attach caption update handlers
    els.insertedImagesList.querySelectorAll('.image-caption-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const imageId = e.target.dataset.imageId;
        const img = insertedImages.find(i => i.id === imageId);
        if (img) {
          img.caption = e.target.value;
          // Update caption in editor
          const captionEl = els.editor.querySelector(`[data-image-id="${imageId}"] .image-caption`);
          if (captionEl) {
            captionEl.textContent = e.target.value;
          }
        }
      });
    });

    // Attach remove handlers
    els.insertedImagesList.querySelectorAll('[data-remove-image]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const imageId = e.target.dataset.removeImage;
        removeImage(imageId, els);
      });
    });
  }

  function removeImage(imageId, els) {
    // Remove from array
    insertedImages = insertedImages.filter(img => img.id !== imageId);

    // Remove from editor
    const imageContainer = els.editor.querySelector(`[data-image-id="${imageId}"]`);
    if (imageContainer) {
      imageContainer.remove();
    }

    updateInsertedImagesList(els);
  }

  // Featured image upload and preview
  function setupFeaturedImagePreview(els) {
    if (!els.featuredImageInput || !els.featuredImagePreview) return;

    // Handle file upload
    if (els.featuredImageFileInput && els.uploadFeaturedBtn) {
      els.uploadFeaturedBtn.addEventListener('click', () => {
        els.featuredImageFileInput.click();
      });

      els.featuredImageFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check file size (limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Image file too large. Please choose a file under 5MB.', 'error');
          }
          return;
        }

        try {
          // Show uploading state
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Uploading featured image...', 'info');
          }

          if (els.uploadFeaturedBtn) {
            els.uploadFeaturedBtn.disabled = true;
            els.uploadFeaturedBtn.textContent = 'Uploading...';
          }

          // Convert to base64
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Upload to Imgur
          // Use window.API_BASE_URL if available, otherwise fallback
          const apiBase = window.API_BASE_URL ||
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:3000'
              : 'https://power-choosers-crm-792458658491.us-central1.run.app');

          // Check if base64 is too large (warn if over 8MB)
          const base64SizeMB = (base64.length * 3) / 4 / 1024 / 1024;
          if (base64SizeMB > 8) {
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('Image is very large. This may take a moment...', 'info');
            }
          }

          // Create abort controller for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

          let response;
          try {
            response = await fetch(`${apiBase}/api/upload/signature-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: base64, type: 'featured-image' }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              throw new Error('Upload timed out. The image may be too large.');
            }
            throw fetchError;
          }

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[Post Editor] Upload failed:', response.status, errorText);
            throw new Error(`Upload failed: ${response.status}`);
          }

          const result = await response.json();
          if (!result.success || !result.imageUrl) {
            throw new Error('Upload failed: Invalid response');
          }

          // Set the image URL
          els.featuredImageInput.value = result.imageUrl;
          if (els.featuredImageUrlInput) els.featuredImageUrlInput.value = result.imageUrl;

          // Show preview
          els.featuredImagePreviewImg.src = result.imageUrl;
          els.featuredImagePreview.style.display = 'block';

          // Reset button state
          if (els.uploadFeaturedBtn) {
            els.uploadFeaturedBtn.disabled = false;
            els.uploadFeaturedBtn.textContent = 'Upload Image';
          }

          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Featured image uploaded successfully', 'success');
          }
        } catch (error) {
          console.error('[Post Editor] Featured image upload error:', error);

          // Reset button state
          if (els.uploadFeaturedBtn) {
            els.uploadFeaturedBtn.disabled = false;
            els.uploadFeaturedBtn.textContent = 'Upload Image';
          }

          let errorMessage = 'Failed to upload featured image';
          if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            errorMessage = 'Upload timed out. The image may be too large. Try a smaller image or use a URL instead.';
          } else if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_RESET')) {
            errorMessage = 'Connection error. The image may be too large. Try compressing the image or using a URL instead.';
          }

          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Failed to upload featured image', 'error');
          }
        } finally {
          if (els.uploadFeaturedBtn) {
            els.uploadFeaturedBtn.disabled = false;
            els.uploadFeaturedBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Upload Image';
          }
          // Reset file input
          els.featuredImageFileInput.value = '';
        }
      });
    }

    // Handle URL input
    if (els.featuredImageUrlInput) {
      els.featuredImageUrlInput.addEventListener('input', () => {
        const url = els.featuredImageUrlInput.value.trim();
        if (url) {
          els.featuredImageInput.value = url;
          els.featuredImagePreviewImg.src = url;
          els.featuredImagePreview.style.display = 'block';
        } else {
          els.featuredImageInput.value = '';
          els.featuredImagePreview.style.display = 'none';
        }
      });
    }

    // Handle remove button
    if (els.removeFeaturedBtn) {
      els.removeFeaturedBtn.addEventListener('click', () => {
        els.featuredImageInput.value = '';
        if (els.featuredImageUrlInput) els.featuredImageUrlInput.value = '';
        if (els.featuredImageFileInput) els.featuredImageFileInput.value = '';
        els.featuredImagePreview.style.display = 'none';
      });
    }
  }

  // Extract images and captions from editor content
  function extractImagesFromContent(editor) {
    const images = [];
    const imageContainers = editor.querySelectorAll('.image-with-caption');

    imageContainers.forEach(container => {
      const img = container.querySelector('img');
      const caption = container.querySelector('.image-caption');
      if (img) {
        images.push({
          url: img.src,
          caption: caption ? caption.textContent.trim() : '',
          alt: img.alt || ''
        });
      }
    });

    return images;
  }

  // Get editor content as HTML
  function getEditorContent(editor) {
    return editor.innerHTML;
  }

  // Set editor content
  function setEditorContent(editor, html) {
    editor.innerHTML = html || '';
    insertedImages = [];

    // Extract images from content
    const imageContainers = editor.querySelectorAll('.image-with-caption');
    imageContainers.forEach((container, index) => {
      const img = container.querySelector('img');
      const caption = container.querySelector('.image-caption');
      if (img) {
        const imageId = `img_${Date.now()}_${index}`;
        container.dataset.imageId = imageId;
        insertedImages.push({
          id: imageId,
          url: img.src,
          caption: caption ? caption.textContent.trim() : ''
        });
      }
    });
  }

  // Open modal for creating new post
  function openCreatePostModal() {
    const els = initDomRefs();
    if (!els.modal) return;

    currentPostId = null;
    insertedImages = [];

    // Reset form
    if (els.form) els.form.reset();
    if (els.editor) els.editor.innerHTML = '';
    if (els.featuredImagePreview) els.featuredImagePreview.style.display = 'none';
    if (els.insertedImagesSection) els.insertedImagesSection.style.display = 'none';
    if (els.title) els.title.textContent = 'Create Post';
    if (els.publishBtn) els.publishBtn.textContent = 'Publish';
    if (els.featuredImageUrlInput) els.featuredImageUrlInput.value = '';
    if (els.featuredImageFileInput) els.featuredImageFileInput.value = '';

    // Reset steps to step 1
    const stepNavBtns = els.modal.querySelectorAll('.step-nav-btn');
    const steps = els.modal.querySelectorAll('.post-step');
    stepNavBtns.forEach((btn, index) => {
      if (index === 0) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    steps.forEach((step, index) => {
      if (index === 0) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });

    // Set default publish date to now
    if (els.publishDateInput) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      els.publishDateInput.value = now.toISOString().slice(0, 16);
    }

    // Show modal
    els.modal.removeAttribute('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.modal.classList.add('show');
      });
    });

    // Focus first input
    setTimeout(() => {
      if (els.titleInput) els.titleInput.focus();
    }, 100);
  }

  // Open modal for editing existing post
  function openEditPostModal(postId, postData) {
    const els = initDomRefs();
    if (!els.modal) return;

    currentPostId = postId;

    // Populate form
    if (els.titleInput) els.titleInput.value = postData.title || '';
    if (els.slugInput) els.slugInput.value = postData.slug || '';
    if (els.categoryInput) els.categoryInput.value = postData.category || '';
    if (els.statusSelect) els.statusSelect.value = postData.status || 'draft';
    if (els.metaDescInput) els.metaDescInput.value = postData.metaDescription || '';
    if (els.keywordsInput) els.keywordsInput.value = postData.keywords || '';
    if (els.featuredImageInput) els.featuredImageInput.value = postData.featuredImage || '';
    if (els.featuredImageUrlInput) els.featuredImageUrlInput.value = postData.featuredImage || '';
    if (els.editor) setEditorContent(els.editor, postData.content || '');

    if (postData.publishDate) {
      const date = postData.publishDate.toDate ? postData.publishDate.toDate() : new Date(postData.publishDate);
      if (els.publishDateInput) {
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        els.publishDateInput.value = date.toISOString().slice(0, 16);
      }
    }

    if (els.title) els.title.textContent = 'Edit Post';
    if (els.publishBtn) els.publishBtn.textContent = postData.status === 'published' ? 'Update' : 'Publish';

    // Update featured image preview
    if (postData.featuredImage && els.featuredImagePreview) {
      els.featuredImagePreviewImg.src = postData.featuredImage;
      els.featuredImagePreview.style.display = 'block';
    }

    // Show modal
    els.modal.removeAttribute('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.modal.classList.add('show');
      });
    });

    // Update inserted images list
    updateInsertedImagesList(els);
  }

  // Close modal
  function closeModal() {
    const els = initDomRefs();
    if (!els.modal) return;

    els.modal.classList.remove('show');
    setTimeout(() => {
      els.modal.setAttribute('hidden', '');
    }, 300);
  }

  // Handle form submission
  async function handleSubmit(e, isDraft = false) {
    e.preventDefault();

    const els = initDomRefs();
    if (!els.form || !window.firebaseDB) return;

    const formData = new FormData(els.form);
    const title = els.titleInput?.value.trim();

    if (!title) {
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Post title is required', 'error');
      }
      return;
    }

    try {
      // Show saving state
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast(isDraft ? 'Saving draft...' : 'Publishing post...', 'info');
      }

      const postData = {
        title,
        slug: els.slugInput?.value.trim() || generateSlug(title),
        category: els.categoryInput?.value.trim() || '',
        status: isDraft ? 'draft' : (els.statusSelect?.value || 'published'),
        metaDescription: els.metaDescInput?.value.trim() || '',
        keywords: els.keywordsInput?.value.trim() || '',
        featuredImage: els.featuredImageInput?.value.trim() || '',
        content: getEditorContent(els.editor),
        images: extractImagesFromContent(els.editor),
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      };

      if (els.publishDateInput?.value) {
        postData.publishDate = window.firebase.firestore.Timestamp.fromDate(new Date(els.publishDateInput.value));
      }

      let savedPostId = currentPostId;

      if (currentPostId) {
        // Update existing post
        await window.firebaseDB.collection('posts').doc(currentPostId).update(postData);

        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Post updated successfully', 'success');
        }
      } else {
        // Create new post
        postData.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        if (!postData.publishDate && !isDraft) {
          postData.publishDate = window.firebase.firestore.FieldValue.serverTimestamp();
        }

        const docRef = await window.firebaseDB.collection('posts').add(postData);

        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Post created successfully', 'success');
        }

        savedPostId = docRef.id;
        currentPostId = savedPostId;
      }

      // Generate static HTML if published
      if (!isDraft && postData.status === 'published' && savedPostId) {
        try {
          // Use window.API_BASE_URL if available, otherwise fallback
          const apiBase = window.API_BASE_URL ||
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:3000'
              : 'https://power-choosers-crm-792458658491.us-central1.run.app');

          const response = await fetch(`${apiBase}/api/posts/generate-static`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: savedPostId })
          });

          if (response.ok) {
            const result = await response.json();
            if (!result.skipped) {
              console.log('[Post Editor] Static HTML generated:', result.htmlUrl);
              if (window.crm && typeof window.crm.showToast === 'function') {
                const message = currentPostId
                  ? 'Post updated and static HTML regenerated'
                  : 'Post published and static HTML generated';
                window.crm.showToast(message, 'success');
              }
            } else {
              console.warn('[Post Editor] Static generation skipped:', result.message);
              if (window.crm && typeof window.crm.showToast === 'function') {
                window.crm.showToast('Post saved, but static HTML generation was skipped', 'warning');
              }
            }
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error('[Post Editor] Failed to generate static HTML:', response.status, errorText);
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast(`Post saved, but static HTML generation failed (${response.status}). Please regenerate manually.`, 'error');
            }
          }
        } catch (error) {
          console.error('[Post Editor] Error generating static HTML:', error);
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Post saved, but static HTML generation failed. Please regenerate manually.', 'error');
          }
          // Don't fail the save if static generation fails
        }
      }

      // Refresh news list if available
      if (window.newsModule && typeof window.newsModule.reloadData === 'function') {
        window.newsModule.reloadData();
      } else if (window.newsModule && typeof window.newsModule.loadDataOnce === 'function') {
        // Fallback: reset loaded state and reload
        if (window.newsModule.state) {
          window.newsModule.state.loaded = false;
        }
        window.newsModule.loadDataOnce();
      }

      closeModal();
    } catch (error) {
      console.error('[Post Editor] Error saving post:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to save post', 'error');
      }
    }
  }

  // Step Navigation
  function setupStepNavigation() {
    const modal = document.getElementById('modal-create-post');
    if (!modal) return;

    const stepNavBtns = modal.querySelectorAll('.step-nav-btn');
    const steps = modal.querySelectorAll('.post-step');
    const stepHeaders = modal.querySelectorAll('.step-header');

    // Handle step nav button clicks
    stepNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const stepNum = btn.getAttribute('data-step');
        navigateToStep(stepNum);
      });
    });

    // Handle step header clicks (collapsible)
    stepHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const step = header.closest('.post-step');
        const stepNum = step.getAttribute('data-step');
        navigateToStep(stepNum);
      });
    });

    function navigateToStep(stepNum) {
      // Update nav buttons
      stepNavBtns.forEach(btn => {
        if (btn.getAttribute('data-step') === stepNum) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Update steps
      steps.forEach(step => {
        if (step.getAttribute('data-step') === stepNum) {
          step.classList.add('active');
        } else {
          step.classList.remove('active');
        }
      });
    }
  }

  // ========== AI GENERATION FUNCTIONS ==========

  // Start generating animation with skeletons
  function startGeneratingAnimation(els) {
    if (!els.modal) return;

    // Add orange glow to modal
    els.modal.classList.add('ai-generating');

    // Add skeletons to all input fields
    if (els.titleInput) createSkeletonInField(els.titleInput, 'title');
    if (els.slugInput) createSkeletonInField(els.slugInput, 'slug');
    if (els.categoryInput) createSkeletonInField(els.categoryInput, 'category');
    if (els.metaDescInput) createSkeletonInField(els.metaDescInput, 'meta');
    if (els.keywordsInput) createSkeletonInField(els.keywordsInput, 'keywords');
    if (els.editor) createSkeletonInField(els.editor, 'content');

    console.log('[Post Editor AI] Started generating animation');
  }

  // Stop generating animation
  function stopGeneratingAnimation(els) {
    if (!els.modal) return;

    // Remove orange glow from modal
    els.modal.classList.remove('ai-generating');

    // Remove skeletons from all fields
    if (els.titleInput) removeSkeletonFromField(els.titleInput);
    if (els.slugInput) removeSkeletonFromField(els.slugInput);
    if (els.categoryInput) removeSkeletonFromField(els.categoryInput);
    if (els.metaDescInput) removeSkeletonFromField(els.metaDescInput);
    if (els.keywordsInput) removeSkeletonFromField(els.keywordsInput);
    if (els.editor) removeSkeletonFromField(els.editor);

    console.log('[Post Editor AI] Stopped generating animation');
  }

  // Create skeleton in field
  function createSkeletonInField(field, type) {
    if (!field) return;

    // For input/textarea, use overlay approach without clearing content
    const isInput = field.tagName === 'INPUT' || field.tagName === 'TEXTAREA';
    const isContentEditable = field.contentEditable === 'true';

    // Store original value/content (but don't clear it)
    if (isInput) {
      field.dataset.originalValue = field.value;
      // Ensure field text is hidden during generation
      field.style.color = 'transparent';
      field.style.opacity = '1';

      // Also hide placeholder
      field.classList.add('ai-generating-placeholder');
    } else {
      field.dataset.originalContent = field.innerHTML;
      // Hide content
      field.style.color = 'transparent';
    }

    // Create skeleton container
    const skeletonContainer = document.createElement('div');
    skeletonContainer.className = 'post-field-skeleton-container';

    let skeletonHTML = '';
    if (type === 'title' || type === 'slug') {
      skeletonHTML = `
        <div class="post-skeleton-bar post-skeleton-short"></div>
        <div class="post-skeleton-bar post-skeleton-medium"></div>
      `;
    } else if (type === 'category') {
      skeletonHTML = `
        <div class="post-skeleton-bar post-skeleton-short"></div>
      `;
    } else if (type === 'meta') {
      skeletonHTML = `
        <div class="post-skeleton-bar post-skeleton-medium"></div>
        <div class="post-skeleton-bar post-skeleton-wide"></div>
        <div class="post-skeleton-bar post-skeleton-medium"></div>
      `;
    } else if (type === 'keywords') {
      skeletonHTML = `
        <div class="post-skeleton-bar post-skeleton-medium"></div>
      `;
    } else if (type === 'content') {
      skeletonHTML = `
        <div class="post-skeleton-bar post-skeleton-wide"></div>
        <div class="post-skeleton-bar post-skeleton-medium"></div>
        <div class="post-skeleton-bar post-skeleton-wide"></div>
        <div class="post-skeleton-bar post-skeleton-medium"></div>
        <div class="post-skeleton-bar post-skeleton-wide"></div>
      `;
    }

    skeletonContainer.innerHTML = skeletonHTML;

    // Insert skeleton
    if (isInput) {
      // For inputs, create a simple overlay without moving the field
      // Wrap field in a positioned container if needed
      const parent = field.parentElement;
      let container = parent;

      // Check if parent is already a suitable container
      const parentStyle = window.getComputedStyle(parent);
      const needsWrapper = parentStyle.position === 'static' && !parent.classList.contains('post-skeleton-wrapper');

      if (needsWrapper) {
        // Create a minimal wrapper that doesn't break layout
        container = document.createElement('div');
        container.className = 'post-skeleton-wrapper';
        container.style.position = 'relative';
        container.style.width = '100%';
        // Preserve parent's display style
        const parentDisplay = window.getComputedStyle(parent).display;
        if (parentDisplay === 'flex' || parentDisplay === 'grid') {
          container.style.display = parentDisplay;
        } else {
          container.style.display = 'block';
        }

        // Insert wrapper and move field into it
        parent.insertBefore(container, field);
        container.appendChild(field);
        field.dataset.skeletonWrapped = 'true';
      }

      // Ensure container is positioned
      if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
        container.dataset.skeletonPositioned = 'true';
      }

      // Position skeleton overlay - make sure it doesn't cover the input text
      skeletonContainer.style.position = 'absolute';
      skeletonContainer.style.top = '0';
      skeletonContainer.style.left = '0';
      skeletonContainer.style.right = '0';
      skeletonContainer.style.bottom = '0';
      skeletonContainer.style.pointerEvents = 'none';
      skeletonContainer.style.zIndex = '1';
      skeletonContainer.style.backgroundColor = 'transparent'; // Ensure transparent background

      // Make field appear above skeleton with proper styling
      field.style.position = 'relative';
      field.style.zIndex = '2';
      field.style.backgroundColor = 'transparent'; // Ensure field background is visible

      // Store reference for cleanup
      const skeletonId = `skeleton-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      skeletonContainer.dataset.skeletonId = skeletonId;
      field.dataset.skeletonId = skeletonId;

      // Insert skeleton into container
      container.appendChild(skeletonContainer);
    } else {
      // For contentEditable, insert directly as overlay
      if (!isContentEditable) {
        field.contentEditable = 'true';
        field.dataset.wasContentEditable = 'false';
      }
      // Store original min-height
      const originalMinHeight = field.style.minHeight || '';
      field.style.minHeight = field.style.minHeight || '200px';
      field.style.position = 'relative';

      // Insert skeleton as overlay
      skeletonContainer.style.position = 'absolute';
      skeletonContainer.style.top = '0';
      skeletonContainer.style.left = '0';
      skeletonContainer.style.right = '0';
      skeletonContainer.style.pointerEvents = 'none';
      skeletonContainer.style.zIndex = '1';
      field.appendChild(skeletonContainer);

      // Store original min-height for restoration
      if (originalMinHeight) {
        field.dataset.originalMinHeight = originalMinHeight;
      }
    }

    // Start animation
    setTimeout(() => {
      const bars = skeletonContainer.querySelectorAll('.post-skeleton-bar');
      bars.forEach((bar, index) => {
        bar.style.animationDelay = `${index * 0.15}s`;
        bar.classList.add('skeleton-animate');
      });
    }, 50);
  }

  // Remove skeleton from field
  function removeSkeletonFromField(field) {
    if (!field) return;

    const isInput = field.tagName === 'INPUT' || field.tagName === 'TEXTAREA';
    let skeletonContainer = null;
    let wrapper = null;

    if (isInput) {
      // For inputs, find skeleton by data attribute
      const skeletonId = field.dataset.skeletonId;
      if (skeletonId) {
        skeletonContainer = document.querySelector(`[data-skeleton-id="${skeletonId}"]`);
      }
      // Fallback: search in parent/wrapper
      wrapper = field.closest('.post-skeleton-wrapper');
      if (!skeletonContainer && wrapper) {
        skeletonContainer = wrapper.querySelector('.post-field-skeleton-container');
      }
      if (!skeletonContainer && field.parentElement) {
        skeletonContainer = field.parentElement.querySelector('.post-field-skeleton-container');
      }
    } else {
      // For contentEditable, skeleton is direct child
      skeletonContainer = field.querySelector('.post-field-skeleton-container');
    }

    if (skeletonContainer) {
      // Fade out skeleton
      skeletonContainer.style.opacity = '0';
      skeletonContainer.style.transition = 'opacity 0.3s ease';

      // Immediately ensure field is visible with animation
      if (isInput) {
        field.style.transition = 'color 0.8s ease';
        field.style.color = ''; // Revert to stylesheet color (fades from transparent)
        field.style.opacity = '1';
        field.style.backgroundColor = '';
        field.classList.remove('ai-generating-placeholder');
      } else {
        // For content editable (editor)
        field.style.transition = 'color 0.8s ease';
        field.style.color = '';

        // Ensure all children elements are visible too
        // Force remove any inline color styles that might have been set
        const children = field.querySelectorAll('*');
        children.forEach(child => {
          child.style.removeProperty('color');
          child.style.opacity = '1';
        });
      }

      // Remove after fade
      setTimeout(() => {
        if (skeletonContainer && skeletonContainer.parentNode) {
          skeletonContainer.remove();
        }

        // Restore field styles
        if (isInput) {
          field.style.position = '';
          field.style.zIndex = '';
          field.style.backgroundColor = '';
          delete field.dataset.skeletonId;

          // Remove wrapper if we created one
          if (field.dataset.skeletonWrapped === 'true' && wrapper && wrapper.parentNode) {
            wrapper.parentNode.insertBefore(field, wrapper);
            wrapper.remove();
            delete field.dataset.skeletonWrapped;
          }

          // Restore parent position if we changed it
          const parent = field.parentElement;
          if (parent && parent.dataset.skeletonPositioned === 'true') {
            parent.style.position = '';
            delete parent.dataset.skeletonPositioned;
          }
        } else {
          field.style.position = '';
          if (field.dataset.originalMinHeight) {
            field.style.minHeight = field.dataset.originalMinHeight;
            delete field.dataset.originalMinHeight;
          } else {
            field.style.minHeight = '';
          }
          if (field.dataset.wasContentEditable === 'false') {
            field.contentEditable = 'false';
            delete field.dataset.wasContentEditable;
          }
        }
      }, 300);
    }
  }

  // Generate post with AI
  async function generateWithAI(els) {
    if (!els.modal) return;

    // Ensure modal stays visible
    if (!els.modal.classList.contains('show')) {
      els.modal.classList.add('show');
    }
    if (els.modal.hasAttribute('hidden')) {
      els.modal.removeAttribute('hidden');
    }

    try {
      // Start animation
      startGeneratingAnimation(els);

      // Disable AI button
      if (els.aiGenerateBtn) {
        els.aiGenerateBtn.disabled = true;
        els.aiGenerateBtn.style.opacity = '0.6';
      }

      // Get API base URL
      const apiBase = window.API_BASE_URL || (window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://power-choosers-crm-792458658491.us-central1.run.app');

      // Call API
      const response = await fetch(`${apiBase}/api/posts/generate-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success || !result.post) {
        throw new Error('Invalid response from API');
      }

      const post = result.post;

      // Populate fields with generated content BEFORE stopping animation
      // This ensures the new text is in place (but invisible) when we fade it in
      if (post.title && els.titleInput) {
        els.titleInput.value = post.title;
        // Trigger input event to auto-generate slug
        els.titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (post.slug && els.slugInput) {
        els.slugInput.value = post.slug;
      }

      if (post.category && els.categoryInput) {
        els.categoryInput.value = post.category;
      }

      if (post.metaDescription && els.metaDescInput) {
        els.metaDescInput.value = post.metaDescription;
      }

      if (post.keywords && els.keywordsInput) {
        els.keywordsInput.value = post.keywords;
      }

      if (post.content && els.editor) {
        // Insert content into editor using existing function
        setEditorContent(els.editor, post.content);

        // Start transparent
        els.editor.style.color = 'transparent';

        // Prevent scroll jump by saving scroll position
        const scrollPos = els.editor.scrollTop;

        // Focus editor but prevent scroll
        setTimeout(() => {
          els.editor.focus({ preventScroll: true });
          els.editor.scrollTop = scrollPos;
        }, 100);

        // Manually trigger fade-in since setEditorContent removed the skeleton
        // (which means removeSkeletonFromField won't find it and won't run cleanup)
        requestAnimationFrame(() => {
          els.editor.style.transition = 'color 0.8s ease';
          els.editor.style.color = '';

          // Force remove any inline color styles from children
          const children = els.editor.querySelectorAll('*');
          children.forEach(child => {
            child.style.removeProperty('color');
            child.style.opacity = '1';
          });
        });
      }

      // Stop animation (this starts the fade-out of skeleton and fade-in of text for other fields)
      stopGeneratingAnimation(els);

      // Show success message
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Post generated successfully!', 'success');
      }

      console.log('[Post Editor AI] Post generated successfully');

    } catch (error) {
      console.error('[Post Editor AI] Generation failed:', error);
      stopGeneratingAnimation(els);

      // Show error message
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to generate post. Please try again.', 'error');
      }
    } finally {
      // Re-enable AI button
      if (els.aiGenerateBtn) {
        els.aiGenerateBtn.disabled = false;
        els.aiGenerateBtn.style.opacity = '';
      }
    }
  }

  // Initialize
  function init() {
    const els = initDomRefs();
    if (!els.modal) return;

    // Setup step navigation
    setupStepNavigation();

    // Setup form handlers
    if (els.form) {
      els.form.addEventListener('submit', (e) => handleSubmit(e, false));
    }

    if (els.saveDraftBtn) {
      els.saveDraftBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleSubmit(e, true);
      });
    }

    // Setup modal close handlers
    const closeButtons = els.modal.querySelectorAll('[data-close="post"]');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    // Setup rich text editor
    setupRichTextEditor(els);
    setupSlugGeneration(els);
    setupFeaturedImagePreview(els);

    // Setup AI generate button
    if (els.aiGenerateBtn) {
      els.aiGenerateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        generateWithAI(els);
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.modal && !els.modal.hasAttribute('hidden')) {
        closeModal();
      }
    });
  }

  // Expose API
  window.PostEditor = {
    openCreate: openCreatePostModal,
    openEdit: openEditPostModal,
    close: closeModal,
    init
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

