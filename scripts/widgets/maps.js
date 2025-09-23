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
            <div class="loading-spinner"></div>
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

  // Build rich info window content
  function buildInfoWindowContent(place) {
    const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
    const website = place.websiteURI || '';
    const rating = place.rating ? place.rating.toFixed(1) : '';
    const reviewCount = place.userRatingCount || 0;
    const priceLevel = place.priceLevel ? '$'.repeat(place.priceLevel) : '';
    const businessStatus = place.businessStatus || '';
    
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
      photoHtml = `<div class="place-photo"><img src="${photoUrl}" alt="${place.displayName}" style="width: 100%; height: 40px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;"></div>`;
    }

    return `
      <div class="maps-info-window">
        ${photoHtml}
        <h3>${place.displayName}</h3>
        <p class="address">${place.formattedAddress}</p>
        ${rating ? `<p class="rating">⭐ ${rating}/5 (${reviewCount} reviews)</p>` : ''}
        ${priceLevel ? `<p class="price">${priceLevel}</p>` : ''}
        ${businessType ? `<p class="types">${businessType}</p>` : ''}
        ${phone ? `<p class="phone"><span class="icon-phone" aria-hidden="true"></span> <a href="tel:${phone}" class="link call-link" data-phone="${phone}">${phone}</a></p>` : ''}
        ${website ? `<p class="website"><span class="icon-globe" aria-hidden="true"></span> <a href="${website}" target="_blank" rel="noopener" class="link">Visit Website</a></p>` : ''}
        ${businessStatus && businessStatus !== 'OPERATIONAL' ? `<p class="status"><strong>Status:</strong> ${businessStatus}</p>` : ''}
      </div>
    `;
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
          'photos'
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

        // Search for nearby businesses around this location
        await searchNearbyBusinesses(clickedLocation);
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

  // Search for nearby businesses for prospecting
  async function searchNearbyBusinesses(centerLocation) {
    try {
      const { Place } = await google.maps.importLibrary("places");
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
      
      // Search for nearby businesses within 1km radius
      const request = {
        textQuery: 'business company office',
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
          'photos'
        ],
        locationBias: centerLocation,
        maxResultCount: 20,
        includedType: 'establishment'
      };

      const { places } = await Place.searchByText(request);

      if (places && places.length > 0) {
        // Add nearby business markers with different styling
        places.forEach(nearbyPlace => {
          // Skip if it's the same place we clicked on
          if (nearbyPlace.location.lat === centerLocation.lat && 
              nearbyPlace.location.lng === centerLocation.lng) {
            return;
          }

          const useAdvanced = Boolean(window.GOOGLE_MAP_ID) &&
            google.maps && google.maps.marker &&
            typeof google.maps.marker.AdvancedMarkerElement === 'function';

          let nearbyMarker;
          if (useAdvanced) {
            nearbyMarker = new google.maps.marker.AdvancedMarkerElement({
              position: nearbyPlace.location,
              map: map,
              title: nearbyPlace.displayName
            });
          } else {
            nearbyMarker = new google.maps.Marker({
              position: nearbyPlace.location,
              map: map,
              title: nearbyPlace.displayName,
              icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#4285F4" stroke="#fff" stroke-width="2"/>
                    <circle cx="12" cy="12" r="4" fill="#fff"/>
                  </svg>
                `),
                scaledSize: new google.maps.Size(24, 24),
                anchor: new google.maps.Point(12, 12)
              }
            });
          }

          // Build info content for nearby businesses
          const nearbyInfoContent = buildInfoWindowContent(nearbyPlace);
          const nearbyInfoWindow = new google.maps.InfoWindow({ content: nearbyInfoContent });

          // Click handler for nearby businesses
          const openNearbyInfo = async () => {
            map.setCenter(nearbyPlace.location);
            map.setZoom(15);
            nearbyInfoWindow.open({ anchor: nearbyMarker, map });
            
            // Add click-to-call functionality for nearby business info window
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
            
            // Recursively search for businesses near this new location
            await searchNearbyBusinesses(nearbyPlace.location);
          };

          if (useAdvanced && nearbyMarker && typeof nearbyMarker.addListener === 'function') {
            nearbyMarker.addListener('gmp-click', openNearbyInfo);
          } else if (nearbyMarker && typeof nearbyMarker.addListener === 'function') {
            nearbyMarker.addListener('click', openNearbyInfo);
          }

          window.mapsMarkers.push(nearbyMarker);
        });
      }
    } catch (error) {
      console.error('[Maps Widget] Error searching nearby businesses:', error);
    }
  }

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
          'photos'
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
          
          // Search for nearby businesses for prospecting
          await searchNearbyBusinesses(place.location);
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