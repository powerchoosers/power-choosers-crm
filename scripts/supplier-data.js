(function() {
  'use strict';

  // Shared supplier data for the Power Choosers CRM
  // Provides autocomplete suggestions for electricity supplier fields across all pages

  // Supplier data with ratings and metadata
  window.SupplierData = {
    "NRG": { bbbRating: "A+", popularity: 4, customerService: 3 },
    "TXU": { bbbRating: "A+", popularity: 5, customerService: 4 },
    "APG & E": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
    "Reliant": { bbbRating: "A+", popularity: 5, customerService: 3 },
    "Hudson": { bbbRating: "Unaccredited", popularity: 2, customerService: 2 },
    "Green Mountain": { bbbRating: "Unaccredited", popularity: 3, customerService: 2 },
    "Constellation": { bbbRating: "A+", popularity: 4, customerService: 4 },
    "Tara Energy": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
    "Cirro": { bbbRating: "A+", popularity: 3, customerService: 4 },
    "Engie": { bbbRating: "A+", popularity: 3, customerService: 1 },
    "Gexa": { bbbRating: "Unaccredited", popularity: 4, customerService: 2 },
    "Freepoint": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Shell Energy": { bbbRating: "Unaccredited", popularity: 3, customerService: 2 },
    "Ironhorse": { bbbRating: "4.0 stars", popularity: 1, customerService: 3 },
    "Ammper Power": { bbbRating: "Unaccredited", popularity: 1, customerService: 1 },
    "Direct Energy": { bbbRating: "A+", popularity: 4, customerService: 3 },
    "Just Energy": { bbbRating: "A+", popularity: 3, customerService: 2 },
    "Spark Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Veterans Energy": { bbbRating: "A+", popularity: 2, customerService: 4 },
    "Champion Energy": { bbbRating: "A+", popularity: 3, customerService: 3 },
    "Ambit Energy": { bbbRating: "A+", popularity: 4, customerService: 3 },
    "Bounce Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "First Choice Power": { bbbRating: "A+", popularity: 3, customerService: 3 },
    "Frontier Utilities": { bbbRating: "A+", popularity: 3, customerService: 3 },
    "Gexa Energy": { bbbRating: "A+", popularity: 3, customerService: 2 },
    "Infinite Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Pennywise Power": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Pulse Power": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Smart Prepaid": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Stream Energy": { bbbRating: "A+", popularity: 3, customerService: 2 },
    "TriEagle Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "4Change Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Acacia Energy": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Amigo Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "APG&E": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
    "Brilliant Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Clearview Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Discount Power": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Express Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Flagship Power": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Green Mountain Energy": { bbbRating: "Unaccredited", popularity: 3, customerService: 2 },
    "Hudson Energy": { bbbRating: "Unaccredited", popularity: 2, customerService: 2 },
    "Iberdrola": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Liberty Power": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Momentum Energy": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "New Power Texas": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Octopus Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Payless Power": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "PowerNext": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Pulse Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Rhythm Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Southern Federal Power": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Tara Energy Services": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
    "Think Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Titan Gas & Power": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Veterans Energy Services": { bbbRating: "A+", popularity: 2, customerService: 4 },
    "Wattz Energy": { bbbRating: "A+", popularity: 1, customerService: 3 },
    "Xoom Energy": { bbbRating: "A+", popularity: 2, customerService: 3 },
    "Young Energy": { bbbRating: "A+", popularity: 1, customerService: 3 }
  };

  // Array of supplier names for easy iteration
  window.SupplierNames = Object.keys(window.SupplierData);

  // Function to add supplier suggestions to an input field
  window.addSupplierSuggestions = function(inputElement, datalistId) {
    // console.log('[Supplier Data] addSupplierSuggestions called with:', { inputElement, datalistId });
    if (!inputElement || !datalistId) {
      console.warn('[Supplier Data] Missing inputElement or datalistId');
      return;
    }

    // Create datalist if it doesn't exist
    let datalist = document.getElementById(datalistId);
    if (!datalist) {
      // console.log('[Supplier Data] Creating new datalist with ID:', datalistId);
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      document.body.appendChild(datalist);
    } else {
      // console.log('[Supplier Data] Using existing datalist with ID:', datalistId);
    }

    // Clear existing options
    datalist.innerHTML = '';

    // Add supplier options
    // console.log('[Supplier Data] Adding', window.SupplierNames.length, 'supplier options');
    window.SupplierNames.forEach(supplier => {
      const option = document.createElement('option');
      option.value = supplier;
      datalist.appendChild(option);
    });

    // Connect input to datalist
    inputElement.setAttribute('list', datalistId);
    // console.log('[Supplier Data] Connected input to datalist, list attribute set to:', datalistId);
  };

  // Function to get supplier info by name
  window.getSupplierInfo = function(supplierName) {
    return window.SupplierData[supplierName] || null;
  };

  // Function to search suppliers by partial name
  window.searchSuppliers = function(query) {
    if (!query) return window.SupplierNames;
    
    const lowerQuery = query.toLowerCase();
    return window.SupplierNames.filter(supplier => 
      supplier.toLowerCase().includes(lowerQuery)
    );
  };

  // Auto-apply supplier suggestions to existing fields on page load
  document.addEventListener('DOMContentLoaded', function() {
    // Find all electricity supplier fields
    const supplierFields = document.querySelectorAll('input[name="electricitySupplier"], input[name="companyElectricitySupplier"]');
    
    supplierFields.forEach((field, index) => {
      const datalistId = `supplier-list-${index}`;
      window.addSupplierSuggestions(field, datalistId);
    });
  });

  // Function to apply supplier suggestions to dynamically created fields
  window.applySupplierSuggestionsToField = function(field, context = 'default') {
    if (!field) return;
    
    const datalistId = `${context}-supplier-list`;
    window.addSupplierSuggestions(field, datalistId);
  };

  // console.log('Supplier data loaded:', window.SupplierNames.length, 'suppliers available');
  /*
  console.log('Supplier data functions available:', {
    addSupplierSuggestions: typeof window.addSupplierSuggestions,
    getSupplierInfo: typeof window.getSupplierInfo,
    searchSuppliers: typeof window.searchSuppliers
  });
  */

})();
