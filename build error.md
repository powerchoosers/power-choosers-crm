rc/components/layout/RightPanel.tsx:44:25 - error TS18047: 'pathname' is possibly 'null'.
src/components/layout/TopBar.tsx:127:16 - error TS18047: 'pathname' is possibly 'null'.  
44   const isContactPage = pathname.includes('/contacts/')                                                             
127     } else if (pathname.includes('/dashboard')) {                                                                  
                   ~~~~~~~~                        
src/components/layout/RightPanel.tsx:45:25 - error TS18047: 'pathname' is possibly 'null'.
src/hooks/useTableState.ts:22:18 - error TS18047: 'searchParams' is possibly 'null'.    
45   const isAccountPage = pathname.includes('/accounts/')                             
22     const page = searchParams.get(pageParam)                                                                        
                    ~~~~~~~~~~~~                                                                                       
src/components/layout/RightPanel.tsx:47:20 - error TS18047: 'params' is possibly 'null'.
src/hooks/useTableState.ts:27:12 - error TS18047: 'searchParams' is possibly 'null'.
47   const entityId = params.id as string
27     return searchParams.get(searchParam) || ''
              ~~~~~~~~~~~~
src/components/layout/TopBar.tsx:123:16 - error TS18047: 'pathname' is possibly 'null'.
src/hooks/useTableState.ts:32:40 - error TS18047: 'searchParams' is possibly 'null'.
123     } else if (pathname.includes('/people/')) {
32     const params = new URLSearchParams(searchParams.toString())
                                          ~~~~~~~~~~~~
src/components/layout/TopBar.tsx:124:44 - error TS18047: 'params' is possibly 'null'.
src/hooks/useTableState.ts:43:23 - error TS18047: 'searchParams' is possibly 'null'.
124       baseContext = { type: 'contact', id: params.id, label: `CONTACT: ${String(params.id).slice(0, 12)}` };       
43     const oldString = searchParams.toString()
                         ~~~~~~~~~~~~

src/hooks/useTableState.ts:56:26 - error TS18047: 'searchParams' is possibly 'null'.

56     const currentQuery = searchParams.get(searchParam) || ''
                            ~~~~~~~~~~~~


Found 26 errors in 5 files.

Errors  Files
     1  src/app/network/protocols/[id]/builder/page.tsx:348
    10  src/components/chat/GeminiChat.tsx:966
     3  src/components/layout/RightPanel.tsx:44
     7  src/components/layout/TopBar.tsx:123
     5  src/hooks/useTableState.ts:22