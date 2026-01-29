'use client'
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INDUSTRY_VECTORS, getIndustryFilters } from '@/lib/industry-mapping';

interface FilterDeckProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'people' | 'account';
  columnFilters: { id: string; value: any }[];
  onFilterChange: (columnId: string, value: any) => void;
}

export default function FilterCommandDeck({ 
  isOpen, 
  onClose, 
  type,
  columnFilters,
  onFilterChange 
}: FilterDeckProps) {
  // Helper to check if a value is active for a column
  const isActive = (columnId: string, value: any) => {
    const filter = columnFilters.find(f => f.id === columnId);
    if (!filter) return false;
    
    // Special handling for Industry Vector Logic
    if (columnId === 'industry') {
      const activeIndustries = Array.isArray(filter.value) ? filter.value : [filter.value];
      // A vector is active if its key (e.g. "Manufacturing") is in the active filters
      // This works because we always add the vector key to the filter list when selecting
      return activeIndustries.includes(value);
    }

    if (Array.isArray(filter.value)) {
      return filter.value.includes(value);
    }
    return filter.value === value;
  };

  // Helper to toggle a filter value
  const toggleFilter = (columnId: string, value: any) => {
    const filter = columnFilters.find(f => f.id === columnId);
    let newValue;
    
    // Special handling for Industry Vector Logic
    if (columnId === 'industry') {
      const vectorIndustries = INDUSTRY_VECTORS[value] || [value];
      const currentValues = filter ? (Array.isArray(filter.value) ? filter.value : [filter.value]) : [];
      
      // Check if this vector is already active (by checking the key value)
      const isVectorActive = currentValues.includes(value);

      if (isVectorActive) {
        // Remove all industries associated with this vector
        newValue = currentValues.filter((v: string) => !vectorIndustries.includes(v));
      } else {
        // Add all industries associated with this vector
        // Use Set to prevent duplicates if industries overlap across vectors (though they shouldn't in this map)
        newValue = [...new Set([...currentValues, ...vectorIndustries])];
      }
      
      if (newValue.length === 0) newValue = undefined;
      onFilterChange(columnId, newValue);
      return;
    }

    if (!filter) {
      newValue = [value];
    } else {
      const currentValues = Array.isArray(filter.value) ? filter.value : [filter.value];
      if (currentValues.includes(value)) {
        newValue = currentValues.filter(v => v !== value);
        if (newValue.length === 0) newValue = undefined;
      } else {
        newValue = [...currentValues, value];
      }
    }
    onFilterChange(columnId, newValue);
  };

  const clearFilters = () => {
    onFilterChange('status', undefined);
    onFilterChange('industry', undefined);
    onFilterChange('location', undefined);
  };

  const statusOptions = type === 'people' 
    ? ['Lead', 'Customer', 'Churned']
    : ['ACTIVE_LOAD', 'PROSPECT', 'CHURNED'];

  const industryOptions = Object.keys(INDUSTRY_VECTORS);

  const locationOptions = [
    'Houston',
    'Dallas',
    'Austin',
    'San Antonio',
    'Fort Worth'
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0, y: -10 }}
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="overflow-hidden rounded-xl border border-white/5 bg-zinc-900/30 backdrop-blur-xl relative z-30 mb-6"
        >
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* COLUMN 1: STATUS VECTORS */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {type === 'people' ? 'RELATIONSHIP_STATE' : 'CONTRACT_STATUS'}
              </h4>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map(status => (
                  <FilterChip 
                    key={status}
                    label={status.replace('_', ' ')} 
                    active={isActive('status', status)}
                    onClick={() => toggleFilter('status', status)}
                  />
                ))}
              </div>
            </div>

            {/* COLUMN 2: INDUSTRY VECTOR */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                INDUSTRY_VECTOR
              </h4>
              <div className="flex flex-wrap gap-2">
                {industryOptions.map(industry => (
                  <FilterChip 
                    key={industry}
                    label={industry}
                    active={isActive('industry', industry)}
                    onClick={() => toggleFilter('industry', industry)}
                  />
                ))}
              </div>
            </div>

            {/* COLUMN 3: GEOSPATIAL_VECTOR */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                GEOSPATIAL_VECTOR
              </h4>
              <div className="flex flex-wrap gap-2">
                {locationOptions.map(loc => (
                  <FilterChip 
                    key={loc}
                    label={loc}
                    active={isActive('location', loc)}
                    onClick={() => toggleFilter('location', loc)}
                  />
                ))}
              </div>
            </div>

          </div>

          {/* FOOTER ACTIONS */}
          <div className="px-6 pb-6 flex justify-between items-center border-t border-white/5 pt-6">
            <button 
              onClick={onClose}
              className="text-xs text-zinc-500 hover:text-white font-mono flex items-center gap-2 transition-colors"
            >
              <X className="w-3 h-3" /> CLOSE_DECK
            </button>
            <button 
              onClick={clearFilters}
              className="text-xs text-zinc-500 hover:text-white font-mono uppercase tracking-wider transition-colors"
            >
              CLEAR_VECTORS
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Helper Component for the "Pill" Switches
function FilterChip({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg text-[10px] font-mono border transition-all flex items-center gap-2",
        active 
          ? "bg-[#002FA7]/10 border-[#002FA7] text-white shadow-[0_0_15px_-5px_rgba(0,47,167,0.5)]" 
          : "bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
      )}
    >
      {active && <Check className="w-2.5 h-2.5" />}
      {label}
    </button>
  );
}
