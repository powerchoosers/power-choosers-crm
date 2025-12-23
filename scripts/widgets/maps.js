(function () {
  'use strict';

  // Google Maps Widget for Contact Detail and Account Detail
  // Exposes: window.Widgets.openMaps(contactId), window.Widgets.openMapsForAccount(accountId)
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'maps-widget';
  let map = null;
  let currentContactId = null;
  let currentAccountId = null;
  let currentEntityType = 'contact'; // 'contact' or 'account'
  let isGoogleMapsLoaded = false;

  // Initialize Google Maps API
  function initializeGoogleMaps() {
    if (isGoogleMapsLoaded) return Promise.resolve();
    
    return new Promise((resolve, reject) => {
      // Check if Google Maps is already loaded
      if (window.google && window.google.maps) {
        isGoogleMapsLoaded = true;
        resolve();
        return;
      }

      // Load Google Maps API with Places and Marker libraries using async pattern
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API}&v=weekly&loading=async&libraries=places,marker&callback=initGoogleMapsCallback`;
      script.async = true;
      script.defer = true;
      
      // Set up global callback
      window.initGoogleMapsCallback = () => {
        isGoogleMapsLoaded = true;
        resolve();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Google Maps API'));
      };
      
      document.head.appendChild(script);
    });
  }

  // Get company name for search
  function getCompanyName() {
    try {
      if (currentEntityType === 'account' && currentAccountId) {
        // For account detail page, get the account name
        const accountData = window.getAccountsData ? window.getAccountsData() : [];
        const account = accountData.find(a => String(a.id) === String(currentAccountId));
        return account ? (account.accountName || account.name || account.companyName) : '';
      } else if (currentEntityType === 'contact' && currentContactId) {
        // For contact detail page, get the contact's company
        const peopleData = window.getPeopleData ? window.getPeopleData() : [];
        const contact = peopleData.find(p => String(p.id) === String(currentContactId));
        return contact ? (contact.companyName || contact.company || contact.account_name || '') : '';
      }
      return '';
    } catch (error) {
      console.error('[Maps Widget] Error getting company name:', error);
      return '';
    }
  }

  // Get the widget panel content element
  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  // Remove existing widget
  function removeExistingWidget() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }
  }

  // Close maps widget
  function closeMapsWidget() {
    const card = document.getElementById(WIDGET_ID);
    if (!card) return;
    
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      if (card.parentElement) card.parentElement.removeChild(card);
      return;
    }
    
    // Prepare collapse animation from current height and paddings
    const cs = window.getComputedStyle(card);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const start = card.scrollHeight; // includes padding
    card.style.overflow = 'hidden';
    card.style.height = start + 'px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    // Force reflow
    void card.offsetHeight;
    card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
    card.style.height = '0px';
    card.style.paddingTop = '0px';
    card.style.paddingBottom = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-6px)';
    const pending = new Set(['height', 'padding-top', 'padding-bottom']);
    const onEnd = (e) => {
      if (!e) return;
      if (pending.has(e.propertyName)) pending.delete(e.propertyName);
      if (pending.size > 0) return;
      card.removeEventListener('transitionend', onEnd);
      if (card.parentElement) card.parentElement.removeChild(card);
    };
    card.addEventListener('transitionend', onEnd);
  }

  // Create the widget card
  function createWidgetCard() {
    const companyName = getCompanyName();
    
    const card = document.createElement('div');
    card.className = 'widget-card maps-card';
    card.id = WIDGET_ID;

    card.innerHTML = `
      <div class="widget-card-header">
        <h4 class="widget-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Google Maps
        </h4>
        <button type="button" class="notes-close maps-close" title="Close" aria-label="Close">×</button>
      </div>
      <div class="maps-body">
        <div class="maps-search-container">
          <div class="search-input-wrap">
            <input 
              type="text" 
              id="maps-search-input" 
              class="search-input" 
              placeholder="Search for locations..." 
              value="${companyName}"
              autocomplete="off"
            >
            <button id="maps-search-btn" class="search-btn" title="Search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="maps-container" class="maps-container">
          <div class="maps-loading">
            <div class="maps-skeleton">
              <div class="skeleton-header skeleton-shimmer"></div>
              <div class="skeleton-map skeleton-shimmer"></div>
              <div class="skeleton-controls">
                <div class="skeleton-button skeleton-shimmer"></div>
                <div class="skeleton-button skeleton-shimmer"></div>
              </div>
            </div>
            <p>Loading Google Maps...</p>
          </div>
        </div>
      </div>
    `;

    return card;
  }

  // Initialize the map
  async function initializeMap() {
    try {
      await initializeGoogleMaps();
      
      const mapContainer = document.getElementById('maps-container');
      if (!mapContainer) return;

      // Clear loading state and prepare for map animation
      mapContainer.innerHTML = '';
      mapContainer.style.opacity = '0';
      mapContainer.style.transition = 'opacity 0.5s ease-in-out';

      // Create map (optionally use Map ID for vector map/advanced markers if available)
      const mapOptions = {
        center: { lat: 39.8283, lng: -98.5795 }, // Center of US
        zoom: 2, // Very broad overview - much less zoomed in
        mapTypeId: google.maps.MapTypeId.SATELLITE, // Start in satellite view
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true,
        tilt: 0, // No tilt - flat view
        styles: [
          {
            featureType: 'all',
            elementType: 'geometry.fill',
            stylers: [{ color: '#2c2c2c' }]
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#1e1e1e' }]
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#404040' }]
          }
        ]
      };
      if (window.GOOGLE_MAP_ID) {
        mapOptions.mapId = window.GOOGLE_MAP_ID;
      }
      map = new google.maps.Map(mapContainer, mapOptions);

      // Animate map appearance after it's loaded
      setTimeout(() => {
        mapContainer.style.opacity = '1';
      }, 100);

      // Add click listener for map clicks (satellite view prospecting)
      map.addListener('click', async (event) => {
        const clickedLocation = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };
        await handleMapClick(clickedLocation);
      });

      // Perform initial search if company name exists
      const companyName = getCompanyName();
      if (companyName) {
        await searchPlaces(companyName);
      }

    } catch (error) {
      console.error('[Maps Widget] Error initializing map:', error);
      const mapContainer = document.getElementById('maps-container');
      if (mapContainer) {
        mapContainer.innerHTML = `
          <div class="maps-error">
            <p>Failed to load Google Maps. Please check your API key.</p>
          </div>
        `;
      }
    }
  }

  // Helper function to escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Build rich info window content
  function buildInfoWindowContent(place) {
    const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
    const website = place.websiteURI || '';
    const rating = place.rating ? place.rating.toFixed(1) : '';
    const reviewCount = place.userRatingCount || 0;
    const priceLevel = place.priceLevel ? '$'.repeat(place.priceLevel) : '';
    const businessStatus = place.businessStatus || '';
    const address = place.formattedAddress || '';
    
    // Clean up business types for better display
    let businessType = '';
    if (place.types && place.types.length > 0) {
      // Filter out generic types and format nicely
      const cleanTypes = place.types
        .filter(type => !['establishment', 'point_of_interest', 'store'].includes(type))
        .map(type => type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
        .slice(0, 2); // Show max 2 types
      
      if (cleanTypes.length > 0) {
        businessType = cleanTypes.join(' • ');
      }
    }
    
    // Get photo if available
    let photoHtml = '';
    if (place.photos && place.photos.length > 0) {
      const photo = place.photos[0];
      // Some builds expose getUri/getURI; fall back to getUrl for older types
      const getPhotoUri = (p) => {
        if (typeof p.getURI === 'function') return p.getURI({ maxWidth: 60, maxHeight: 45 });
        if (typeof p.getUri === 'function') return p.getUri({ maxWidth: 60, maxHeight: 45 });
        if (typeof p.getUrl === 'function') return p.getUrl({ maxWidth: 60, maxHeight: 45 });
        return '';
      };
      const photoUrl = getPhotoUri(photo);
      photoHtml = `<div class="place-photo"><img src="${photoUrl}" alt="${escapeHtml(place.displayName)}" style="width: 100%; height: 40px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;"></div>`;
    }

    // Check if we're on account detail page
    const isAccountPage = currentEntityType === 'account' && window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount;

    // Build address with hover actions
    let addressHtml = '';
    if (address) {
      addressHtml = `
        <p class="address maps-actionable" data-value="${escapeHtml(address)}" data-type="address">
          <span class="maps-value">${escapeHtml(address)}</span>
          <span class="maps-actions">
            <button type="button" class="maps-action-btn" data-action="copy" title="Copy address" aria-label="Copy address">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            ${isAccountPage ? `<button type="button" class="maps-action-btn" data-action="add-service-address" title="Add to service addresses" aria-label="Add to service addresses">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>` : ''}
          </span>
        </p>
      `;
    }

    // Build phone with hover actions
    let phoneHtml = '';
    if (phone) {
      phoneHtml = `
        <p class="phone maps-actionable" data-value="${escapeHtml(phone)}" data-type="phone">
          <span class="icon-phone" aria-hidden="true"></span>
          <a href="tel:${phone}" class="link call-link maps-value" data-phone="${phone}">${escapeHtml(phone)}</a>
          <span class="maps-actions">
            <button type="button" class="maps-action-btn" data-action="copy" title="Copy phone number" aria-label="Copy phone number">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            ${isAccountPage ? `<button type="button" class="maps-action-btn" data-action="update-phone" title="Update company phone" aria-label="Update company phone">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>` : ''}
          </span>
        </p>
      `;
    }

    // Build website with hover actions
    let websiteHtml = '';
    if (website) {
      websiteHtml = `
        <p class="website maps-actionable" data-value="${escapeHtml(website)}" data-type="website">
          <span class="icon-globe" aria-hidden="true"></span>
          <a href="${website}" target="_blank" rel="noopener" class="link maps-value">Visit Website</a>
          <span class="maps-actions">
            <button type="button" class="maps-action-btn" data-action="copy" title="Copy website URL" aria-label="Copy website URL">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            ${isAccountPage ? `<button type="button" class="maps-action-btn" data-action="update-website" title="Update website" aria-label="Update website">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>` : ''}
          </span>
        </p>
      `;
    }

    return `
      <div class="maps-info-window">
        ${photoHtml}
        <h3>${escapeHtml(place.displayName)}</h3>
        ${addressHtml}
        ${rating ? `<p class="rating">⭐ ${rating}/5 (${reviewCount} reviews)</p>` : ''}
        ${priceLevel ? `<p class="price">${priceLevel}</p>` : ''}
        ${businessType ? `<p class="types">${businessType}</p>` : ''}
        ${phoneHtml}
        ${websiteHtml}
        ${businessStatus && businessStatus !== 'OPERATIONAL' ? `<p class="status"><strong>Status:</strong> ${businessStatus}</p>` : ''}
      </div>
    `;
  }

  // Handle action button clicks in info windows
  function setupInfoWindowActions(infoWindow) {
    // Use a MutationObserver to detect when info window content is added to DOM
    let observer;
    const setupActions = () => {
      const infoContentEl = document.querySelector('.maps-info-window');
      if (!infoContentEl) return false;
      
      // Find all actionable elements
      const actionableElements = infoContentEl.querySelectorAll('.maps-actionable');
      
      actionableElements.forEach(element => {
        // Skip if already bound
        if (element.dataset.bound === 'true') return;
        element.dataset.bound = 'true';
        
        const value = element.getAttribute('data-value');
        const type = element.getAttribute('data-type');
        const actions = element.querySelector('.maps-actions');
        const valueElement = element.querySelector('.maps-value');
        
        if (!actions || !valueElement) return;
        
        // Show actions on hover
        element.addEventListener('mouseenter', () => {
          actions.style.display = 'flex';
        });
        
        element.addEventListener('mouseleave', () => {
          actions.style.display = 'none';
        });
        
        // Handle action button clicks
        actions.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const btn = e.target.closest('.maps-action-btn');
          if (!btn) return;
          
          const action = btn.getAttribute('data-action');
          if (!action) return;
          
          if (action === 'copy') {
            // Copy to clipboard
            try {
              await navigator.clipboard.writeText(value);
              if (window.crm && window.crm.showToast) {
                const typeLabel = type === 'address' ? 'Address' : type === 'phone' ? 'Phone number' : 'Website';
                window.crm.showToast(`${typeLabel} copied to clipboard`);
              }
            } catch (error) {
              console.error('[Maps Widget] Failed to copy:', error);
              if (window.crm && window.crm.showToast) {
                window.crm.showToast('Failed to copy to clipboard');
              }
            }
          } else if (action === 'add-service-address' && type === 'address') {
            // Add address to service addresses (only for account detail page)
            if (currentEntityType === 'account' && window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
              try {
                const account = window.AccountDetail.state.currentAccount;
                const currentAddresses = Array.isArray(account.serviceAddresses) ? account.serviceAddresses : [];
                
                // Check if address already exists
                const addressExists = currentAddresses.some(addr => 
                  addr.address && addr.address.trim().toLowerCase() === value.trim().toLowerCase()
                );
                
                if (addressExists) {
                  if (window.crm && window.crm.showToast) {
                    window.crm.showToast('Address already exists in service addresses');
                  }
                  return;
                }
                
                // Add new address (first one is primary if none exist)
                const newAddress = {
                  address: value.trim(),
                  isPrimary: currentAddresses.length === 0
                };
                
                const updatedAddresses = [...currentAddresses, newAddress];
                
                // Dispatch event to add service address
                document.dispatchEvent(new CustomEvent('pc:maps-add-service-address', {
                  detail: { address: newAddress, addresses: updatedAddresses }
                }));
                
                if (window.crm && window.crm.showToast) {
                  window.crm.showToast('Address added to service addresses');
                }
              } catch (error) {
                console.error('[Maps Widget] Failed to add service address:', error);
                if (window.crm && window.crm.showToast) {
                  window.crm.showToast('Failed to add service address');
                }
              }
            }
          } else if (action === 'update-phone' && type === 'phone') {
            // Update company phone field (only for account detail page)
            if (currentEntityType === 'account' && window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
              try {
                document.dispatchEvent(new CustomEvent('pc:maps-update-account-field', {
                  detail: { field: 'companyPhone', value: value.trim() }
                }));
                
                if (window.crm && window.crm.showToast) {
                  window.crm.showToast('Company phone updated');
                }
              } catch (error) {
                console.error('[Maps Widget] Failed to update phone:', error);
                if (window.crm && window.crm.showToast) {
                  window.crm.showToast('Failed to update company phone');
                }
              }
            }
          } else if (action === 'update-website' && type === 'website') {
            // Update website field (only for account detail page)
            if (currentEntityType === 'account' && window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
              try {
                document.dispatchEvent(new CustomEvent('pc:maps-update-account-field', {
                  detail: { field: 'website', value: value.trim() }
                }));
                
                if (window.crm && window.crm.showToast) {
                  window.crm.showToast('Website updated');
                }
              } catch (error) {
                console.error('[Maps Widget] Failed to update website:', error);
                if (window.crm && window.crm.showToast) {
                  window.crm.showToast('Failed to update website');
                }
              }
            }
          }
        });
      });
      
      // Disconnect observer after setup
      if (observer) {
        observer.disconnect();
      }
      return true;
    };
    
    // Try immediately
    if (setupActions()) return;
    
    // Set up observer to watch for info window content
    observer = new MutationObserver(() => {
      if (setupActions()) {
        if (observer) observer.disconnect();
      }
    });
    
    // Observe the document body for info window content
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also set up after a short delay
    setTimeout(() => {
      if (setupActions() && observer) {
        observer.disconnect();
      }
    }, 100);
  }

  // Handle map clicks to find businesses at that location
  async function handleMapClick(clickedLocation) {
    try {
      const { Place } = await google.maps.importLibrary("places");
      
      // Search for businesses at the clicked location
      const request = {
        textQuery: 'business company office store restaurant',
        fields: [
          'displayName', 
          'location', 
          'formattedAddress', 
          'rating', 
          'userRatingCount',
          'nationalPhoneNumber',
          'internationalPhoneNumber',
          'businessStatus',
          'priceLevel',
          'types',
          'photos',
          'websiteURI'
        ],
        locationBias: clickedLocation,
        maxResultCount: 5,
        includedType: 'establishment'
      };

      const { places } = await Place.searchByText(request);

      if (places && places.length > 0) {
        // Find the closest business to the clicked location
        let closestPlace = places[0];
        let minDistance = getDistance(clickedLocation, places[0].location);
        
        places.forEach(place => {
          const distance = getDistance(clickedLocation, place.location);
          if (distance < minDistance) {
            minDistance = distance;
            closestPlace = place;
          }
        });

        // Auto-fill search bar with the business name
        const searchInput = document.getElementById('maps-search-input');
        if (searchInput && closestPlace.displayName) {
          searchInput.value = closestPlace.displayName;
        }

        // Show info window for the closest business
        const infoContent = buildInfoWindowContent(closestPlace);
        const infoWindow = new google.maps.InfoWindow({ 
          content: infoContent,
          position: clickedLocation
        });
        
        infoWindow.open(map);
        
        // Setup action buttons
        setupInfoWindowActions(infoWindow);

        // Add click-to-call functionality
        setTimeout(() => {
          const callLinks = document.querySelectorAll('.call-link');
          callLinks.forEach(link => {
            link.addEventListener('click', (e) => {
              e.preventDefault();
              const phoneNumber = link.getAttribute('data-phone');
              if (phoneNumber && window.Widgets && window.Widgets.callNumber) {
                // Set the click timestamp for fresh user gesture
                if (window.Widgets) {
                  window.Widgets._lastClickToCallAt = Date.now();
                }
                // Use the CRM's call function with click-to-call source and auto-trigger
                window.Widgets.callNumber(phoneNumber, '', true, 'click-to-call');
              } else if (phoneNumber) {
                window.location.href = `tel:${phoneNumber}`;
              }
            });
          });
        }, 100);

        // Nearby business prospecting removed per request
      }
    } catch (error) {
      console.error('[Maps Widget] Error handling map click:', error);
    }
  }

  // Calculate distance between two points (simple approximation)
  function getDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Nearby business prospecting removed per request

  // Search for places using the new Place API
  async function searchPlaces(query) {
    if (!query.trim()) return;

    const searchInput = document.getElementById('maps-search-input');
    if (searchInput) {
      searchInput.value = query;
    }

    try {
      // Use the new Place API instead of deprecated PlacesService
      const { Place } = await google.maps.importLibrary("places");
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
      
      // Create a text search request with basic fields first
      const request = {
        textQuery: query,
        fields: [
          'displayName', 
          'location', 
          'formattedAddress', 
          'rating', 
          'userRatingCount',
          'nationalPhoneNumber',
          'internationalPhoneNumber',
          'businessStatus',
          'priceLevel',
          'types',
          'photos',
          'websiteURI'
        ],
        locationBias: map.getCenter(),
        maxResultCount: 10
      };

      const { places } = await Place.searchByText(request);

      if (places && places.length > 0) {
        // Clear existing markers
        if (window.mapsMarkers) {
          window.mapsMarkers.forEach(marker => marker.setMap(null));
        }
        window.mapsMarkers = [];

        // Add markers for each result
        places.forEach(place => {
          let marker;
          const useAdvanced = Boolean(window.GOOGLE_MAP_ID) &&
            google.maps && google.maps.marker &&
            typeof google.maps.marker.AdvancedMarkerElement === 'function';

          if (useAdvanced) {
            marker = new google.maps.marker.AdvancedMarkerElement({
              position: place.location,
              map: map,
              title: place.displayName
            });
          } else {
            marker = new google.maps.Marker({
              position: place.location,
              map: map,
              title: place.displayName
            });
          }

          // Build rich info window content
          const infoContent = buildInfoWindowContent(place);
          const infoWindow = new google.maps.InfoWindow({ content: infoContent });

          // Bind click per marker type - zoom in and show info
          const openInfo = async () => {
            // Zoom in on this specific location
            map.setCenter(place.location);
            map.setZoom(15); // Close-up view of the business
            
          // Show the info window
          infoWindow.open({ anchor: marker, map });
          
          // Setup action buttons
          setupInfoWindowActions(infoWindow);
          
          // Add click-to-call functionality after info window opens
          setTimeout(() => {
            const callLinks = document.querySelectorAll('.call-link');
            callLinks.forEach(link => {
              link.addEventListener('click', (e) => {
                e.preventDefault();
                const phoneNumber = link.getAttribute('data-phone');
                if (phoneNumber && window.Widgets && window.Widgets.callNumber) {
                  // Set the click timestamp for fresh user gesture
                  if (window.Widgets) {
                    window.Widgets._lastClickToCallAt = Date.now();
                  }
                  // Use the CRM's call function with click-to-call source and auto-trigger
                  window.Widgets.callNumber(phoneNumber, '', true, 'click-to-call');
                } else if (phoneNumber) {
                  // Fallback to tel: link
                  window.location.href = `tel:${phoneNumber}`;
                }
              });
            });
          }, 100);
          
          // Nearby business prospecting removed per request
          };
          
          if (useAdvanced && marker && typeof marker.addListener === 'function') {
            marker.addListener('gmp-click', openInfo);
          } else if (marker && typeof marker.addListener === 'function') {
            marker.addListener('click', openInfo);
          }

          window.mapsMarkers.push(marker);
        });

        // Fit map to show all results
        if (places.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          places.forEach(place => {
            bounds.extend(place.location);
          });
          map.fitBounds(bounds);
        }
      } else {
        // No results found
        const mapContainer = document.getElementById('maps-container');
        if (mapContainer) {
          mapContainer.innerHTML = `
            <div class="maps-error">
              <p>No locations found for "${query}"</p>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('[Maps Widget] Error searching places:', error);
      const mapContainer = document.getElementById('maps-container');
      if (mapContainer) {
        mapContainer.innerHTML = `
          <div class="maps-error">
            <p>Error searching for locations. Please try again.</p>
          </div>
        `;
      }
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    // Close button
    const closeBtn = document.querySelector('.maps-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeMapsWidget);
    }

    // Search button
    const searchBtn = document.getElementById('maps-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        const input = document.getElementById('maps-search-input');
        if (input && input.value.trim()) {
          searchPlaces(input.value.trim());
        }
      });
    }

    // Search input enter key
    const searchInput = document.getElementById('maps-search-input');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.value.trim()) {
          searchPlaces(e.target.value.trim());
        }
      });
    }
  }

  // Open maps widget for contact
  function openMaps(contactId) {
    currentContactId = contactId;
    currentAccountId = null;
    currentEntityType = 'contact';
    
    removeExistingWidget();
    
    const panelContent = getPanelContentEl();
    if (!panelContent) {
      console.error('[Maps Widget] Widget panel not found');
      return;
    }

    const card = createWidgetCard();
    
    // Smooth expand-in animation that pushes other widgets down (like notes widget)
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('maps-anim'); } catch (_) {}
      // Prevent flash before we collapse and read paddings after insertion
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    // Insert at the top of the panel content to slide down from top
    if (panelContent.firstChild) {
      panelContent.insertBefore(card, panelContent.firstChild);
    } else {
      panelContent.appendChild(card);
    }

    if (!prefersReduce) {
      // Collapse now that it's in the DOM, and store paddings
      const cs = window.getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      card.dataset._pt = String(pt);
      card.dataset._pb = String(pb);
      card.style.overflow = 'hidden';
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';

      // Next frame: expand to natural height + paddings
      requestAnimationFrame(() => {
        // scrollHeight here is content height because padding is 0; don't add padding to height to avoid double-count
        const target = card.scrollHeight;
        card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
        card.style.height = target + 'px';
        card.style.paddingTop = pt + 'px';
        card.style.paddingBottom = pb + 'px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        const pending = new Set(['height', 'padding-top', 'padding-bottom']);
        const onEnd = (e) => {
          if (!e) return;
          if (pending.has(e.propertyName)) pending.delete(e.propertyName);
          if (pending.size > 0) return;
          card.removeEventListener('transitionend', onEnd);
          // Clean up transition styles
          card.style.transition = '';
          card.style.overflow = '';
          card.style.height = '';
        };
        card.addEventListener('transitionend', onEnd);
      });
    }

    // Setup event listeners
    setupEventListeners();

    // Initialize map after a short delay to ensure DOM is ready
    setTimeout(() => {
      initializeMap();
    }, 100);
  }

  // Open maps widget for account
  function openMapsForAccount(accountId) {
    currentAccountId = accountId;
    currentContactId = null;
    currentEntityType = 'account';
    
    removeExistingWidget();
    
    const panelContent = getPanelContentEl();
    if (!panelContent) {
      console.error('[Maps Widget] Widget panel not found');
      return;
    }

    const card = createWidgetCard();
    
    // Smooth expand-in animation that pushes other widgets down (like notes widget)
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('maps-anim'); } catch (_) {}
      // Prevent flash before we collapse and read paddings after insertion
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    // Insert at the top of the panel content to slide down from top
    if (panelContent.firstChild) {
      panelContent.insertBefore(card, panelContent.firstChild);
    } else {
      panelContent.appendChild(card);
    }

    if (!prefersReduce) {
      // Collapse now that it's in the DOM, and store paddings
      const cs = window.getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      card.dataset._pt = String(pt);
      card.dataset._pb = String(pb);
      card.style.overflow = 'hidden';
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';

      // Next frame: expand to natural height + paddings
      requestAnimationFrame(() => {
        // scrollHeight here is content height because padding is 0; don't add padding to height to avoid double-count
        const target = card.scrollHeight;
        card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
        card.style.height = target + 'px';
        card.style.paddingTop = pt + 'px';
        card.style.paddingBottom = pb + 'px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        const pending = new Set(['height', 'padding-top', 'padding-bottom']);
        const onEnd = (e) => {
          if (!e) return;
          if (pending.has(e.propertyName)) pending.delete(e.propertyName);
          if (pending.size > 0) return;
          card.removeEventListener('transitionend', onEnd);
          // Clean up transition styles
          card.style.transition = '';
          card.style.overflow = '';
          card.style.height = '';
        };
        card.addEventListener('transitionend', onEnd);
      });
    }

    // Setup event listeners
    setupEventListeners();

    // Initialize map after a short delay to ensure DOM is ready
    setTimeout(() => {
      initializeMap();
    }, 100);
  }

  // Check if maps widget is open
  function isMapsOpen() {
    return document.getElementById(WIDGET_ID) !== null;
  }

  // Close maps widget
  function closeMaps() {
    closeMapsWidget();
  }

  // Expose public API
  window.Widgets.openMaps = openMaps;
  window.Widgets.openMapsForAccount = openMapsForAccount;
  window.Widgets.isMapsOpen = isMapsOpen;
  window.Widgets.closeMaps = closeMaps;

})();