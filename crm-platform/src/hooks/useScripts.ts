import { useQuery } from '@tanstack/react-query'

export interface Script {
  id: string
  title: string
  category: 'Sales' | 'Support' | 'Objection Handling' | 'Closing'
  content: string
  lastUpdated: string
}

export function useScripts() {
  return useQuery({
    queryKey: ['scripts'],
    queryFn: async () => {
      // Mock Data Fallback
      return [
        { 
          id: '1', 
          title: 'Cold Call Intro', 
          category: 'Sales', 
          content: "Hi, this is [Name] with Nodal Point. I'm calling because...", 
          lastUpdated: '2024-03-10' 
        },
        { 
          id: '2', 
          title: 'Handling "Not Interested"', 
          category: 'Objection Handling', 
          content: "I completely understand. Just to clarify, are you not interested in...", 
          lastUpdated: '2024-02-28' 
        },
        { 
          id: '3', 
          title: 'Closing the Deal', 
          category: 'Closing', 
          content: "Based on what we've discussed, I recommend plan X. Shall we proceed?", 
          lastUpdated: '2024-03-05' 
        },
        { 
          id: '4', 
          title: 'Support Greeting', 
          category: 'Support', 
          content: "Thank you for calling Nodal Point Support. How can I help you today?", 
          lastUpdated: '2023-12-15' 
        },
      ] as Script[]
    }
  })
}
