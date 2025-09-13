// Shared supplier data for use across the CRM
// This data is used in the Energy Health Check widget and contact/account detail pages

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
  "Ammper Power": { bbbRating: "Unaccredited", popularity: 1, customerService: 1 }
};

window.SupplierNames = Object.keys(window.SupplierData);

// Helper function to create a datalist element with supplier options
window.createSupplierDatalist = function(id = 'supplier-list') {
  const datalist = document.createElement('datalist');
  datalist.id = id;
  window.SupplierNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    datalist.appendChild(option);
  });
  return datalist;
};

// Helper function to add supplier suggestions to an input field
window.addSupplierSuggestions = function(input, datalistId = 'supplier-list') {
  if (!input) return;
  
  // Create datalist if it doesn't exist
  let datalist = document.getElementById(datalistId);
  if (!datalist) {
    datalist = window.createSupplierDatalist(datalistId);
    document.body.appendChild(datalist);
  }
  
  // Connect input to datalist
  input.setAttribute('list', datalistId);
};
