(function () {
  'use strict';

  // Google Maps Widget for Contact Detail and Account Detail
  // Exposes: window.Widgets.openMaps(contactId), window.Widgets.openMapsForAccount(accountId)
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'maps-widget';
  let map = null;
  let placesService = null;
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

      // Load Google Maps API
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API}&libraries=places`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
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
        return account ? account.name : '';
      } else if (currentEntityType === 'contact' && currentContactId) {
        // For contact detail page, get the contact's company
        const peopleData = window.getPeopleData ? window.getPeopleData() : [];
        const contact = peopleData.find(p => String(p.id) === String(currentContactId));
        return contact ? (contact.company || contact.account_name || '') : '';
      }
      return '';
    } catch (error) {
      console.error('[Maps Widget] Error getting company name:', error);
      return '';
    }
  }

  // Create the widget HTML
  function createWidgetHTML() {
    const companyName = getCompanyName();
    
    return `
      <div id="${WIDGET_ID}" class="widget-panel">
        <div class="widget-header">
          <h3 class="widget-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            Google Maps
          </h3>
          <button class="widget-close" aria-label="Close widget">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="widget-content">
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
                  <path d="M21 21l-4.35-4.35"/>
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
      </div>
    `;
  }

  // Initialize the map
  function initializeMap() {
    const mapContainer = document.getElementById('maps-container');
    if (!mapContainer) return;

    // Clear loading state
    mapContainer.innerHTML = '';

    // Create map
    map = new google.maps.Map(mapContainer, {
      center: { lat: 39.8283, lng: -98.5795 }, // Center of US
      zoom: 4,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      zoomControl: true,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ]
    });

    // Initialize Places service
    placesService = new google.maps.places.PlacesService(map);

    // Add search functionality
    setupSearchFunctionality();

    // If we have a company name, search for it automatically
    const companyName = getCompanyName();
    if (companyName) {
      searchForPlaces(companyName);
    }
  }

  // Setup search functionality
  function setupSearchFunctionality() {
    const searchInput = document.getElementById('maps-search-input');
    const searchBtn = document.getElementById('maps-search-btn');

    if (!searchInput || !searchBtn) return;

    // Search on button click
    searchBtn.addEventListener('click', () => {
      const query = searchInput.value.trim();
      if (query) {
        searchForPlaces(query);
      }
    });

    // Search on Enter key
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          searchForPlaces(query);
        }
      }
    });

    // Auto-search when typing (with debounce)
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value.trim();
        if (query.length > 2) {
          searchForPlaces(query);
        }
      }, 500);
    });
  }

  // Search for places
  function searchForPlaces(query) {
    if (!placesService || !query) return;

    const request = {
      query: query,
      fields: ['name', 'geometry', 'formatted_address', 'place_id', 'rating', 'user_ratings_total', 'types']
    };

    placesService.textSearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        displaySearchResults(results);
      } else {
        console.warn('[Maps Widget] Places search failed:', status);
        showNoResults();
      }
    });
  }

  // Display search results
  function displaySearchResults(results) {
    // Clear existing markers
    if (window.mapsMarkers) {
      window.mapsMarkers.forEach(marker => marker.setMap(null));
    }
    window.mapsMarkers = [];

    if (!results || results.length === 0) {
      showNoResults();
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    const infoWindow = new google.maps.InfoWindow();

    results.forEach((place, index) => {
      if (place.geometry && place.geometry.location) {
        const marker = new google.maps.Marker({
          position: place.geometry.location,
          map: map,
          title: place.name,
          animation: google.maps.Animation.DROP
        });

        // Create info window content
        const infoContent = `
          <div class="maps-info-window">
            <h4>${place.name}</h4>
            <p class="address">${place.formatted_address}</p>
            ${place.rating ? `<p class="rating">⭐ ${place.rating} (${place.user_ratings_total || 0} reviews)</p>` : ''}
            <p class="types">${place.types ? place.types.slice(0, 3).join(', ') : ''}</p>
          </div>
        `;

        marker.addListener('click', () => {
          infoWindow.setContent(infoContent);
          infoWindow.open(map, marker);
        });

        window.mapsMarkers.push(marker);
        bounds.extend(place.geometry.location);
      }
    });

    // Fit map to show all results
    if (window.mapsMarkers.length > 0) {
      map.fitBounds(bounds);
      
      // If only one result, zoom in more
      if (window.mapsMarkers.length === 1) {
        map.setZoom(15);
      }
    }
  }

  // Show no results message
  function showNoResults() {
    const mapContainer = document.getElementById('maps-container');
    if (mapContainer) {
      const noResults = document.createElement('div');
      noResults.className = 'maps-no-results';
      noResults.innerHTML = `
        <div class="no-results-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <h4>No locations found</h4>
          <p>Try searching for a different term or check your spelling.</p>
        </div>
      `;
      mapContainer.appendChild(noResults);
    }
  }

  // Open widget for contact
  window.Widgets.openMaps = function(contactId) {
    currentContactId = contactId;
    currentAccountId = null;
    currentEntityType = 'contact';
    openWidget();
  };

  // Open widget for account
  window.Widgets.openMapsForAccount = function(accountId) {
    currentAccountId = accountId;
    currentContactId = null;
    currentEntityType = 'account';
    openWidget();
  };

  // Open the widget
  function openWidget() {
    // Remove existing widget if present
    const existingWidget = document.getElementById(WIDGET_ID);
    if (existingWidget) {
      existingWidget.remove();
    }

    // Create and show widget
    const widgetHTML = createWidgetHTML();
    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;

    // Add event listeners
    const closeBtn = widget.querySelector('.widget-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeWidget);
    }

    // Close on escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeWidget();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    // Initialize Google Maps
    initializeGoogleMaps()
      .then(() => {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          initializeMap();
        }, 100);
      })
      .catch((error) => {
        console.error('[Maps Widget] Failed to initialize Google Maps:', error);
        const mapContainer = document.getElementById('maps-container');
        if (mapContainer) {
          mapContainer.innerHTML = `
            <div class="maps-error">
              <div class="error-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <h4>Failed to load Google Maps</h4>
                <p>Please check your internet connection and try again.</p>
              </div>
            </div>
          `;
        }
      });

    // Show widget with animation
    requestAnimationFrame(() => {
      widget.classList.add('show');
    });
  }

  // Close the widget
  function closeWidget() {
    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;

    widget.classList.remove('show');
    
    setTimeout(() => {
      widget.remove();
      
      // Clean up map and markers
      if (window.mapsMarkers) {
        window.mapsMarkers.forEach(marker => marker.setMap(null));
        window.mapsMarkers = [];
      }
      
      map = null;
      placesService = null;
    }, 300);
  }

  // Handle widget button clicks
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-widget="maps"]')) {
      e.preventDefault();
      e.stopPropagation();
      
      // Determine if we're on account or contact detail page
      const isAccountPage = document.getElementById('account-detail-view');
      const isContactPage = document.getElementById('contact-detail-view');
      
      if (isAccountPage) {
        // Get account ID from the page
        const accountId = window.AccountDetail?.state?.accountId;
        if (accountId) {
          window.Widgets.openMapsForAccount(accountId);
        }
      } else if (isContactPage) {
        // Get contact ID from the page
        const contactId = window.ContactDetail?.state?.contactId;
        if (contactId) {
          window.Widgets.openMaps(contactId);
        }
      }
    }
  });

})();
