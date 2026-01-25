./src/components/layout/RightPanel.tsx:41:44
Type error: Property 'address' does not exist on type 'ContactDetail'.
  39 |   
  40 |   const entityLocation = (contact ? (contact.city || 'LZ_NORTH') : account?.location) || 'LZ_NORTH'
> 41 |   const entityAddress = (contact ? contact.address : account?.address) || ''
     |                                            ^
  42 |   const entityName = contact?.name || account?.name
  43 |
  44 |   return (