'use client'
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INDUSTRY_VECTORS } from '@/lib/industry-mapping';
import { TITLE_VECTORS } from '@/lib/title-mapping';

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
    
    // Special handling for Industry/Title Vector Logic
    if (columnId === 'industry' || columnId === 'title') {
      const activeValues = Array.isArray(filter.value) ? filter.value : [filter.value];
      return activeValues.includes(value);
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
    
    // Special handling for Industry/Title Vector Logic
    if (columnId === 'industry' || columnId === 'title') {
      const vectorMapping = columnId === 'industry' ? INDUSTRY_VECTORS : TITLE_VECTORS;
      const vectorItems = vectorMapping[value] || [value];
      const currentValues = filter ? (Array.isArray(filter.value) ? filter.value : [filter.value]) : [];
      
      const isVectorActive = currentValues.includes(value);

      if (isVectorActive) {
        // Remove all items associated with this vector, including the vector key itself
        newValue = currentValues.filter((v: string) => !vectorItems.includes(v) && v !== value);
      } else {
        // Add all items associated with this vector, plus the vector key itself
        newValue = [...new Set([...currentValues, ...vectorItems, value])];
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
    onFilterChange('title', undefined);
  };

  const statusOptions = type === 'people' 
    ? ['Lead', 'Customer', 'Churned']
    : ['PROSPECT', 'ACTIVE_LOAD', 'CUSTOMER', 'CHURNED'];

  const industryOptions = Object.keys(INDUSTRY_VECTORS);
  const titleOptions = Object.keys(TITLE_VECTORS);

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
          key="filter-deck"
          initial={{ height: 0, opacity: 0, y: -10 }}
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="overflow-hidden rounded-xl border border-white/5 bg-zinc-900/30 backdrop-blur-xl relative z-30 mb-6"
        >
          <div className={cn(
            "p-6 grid gap-8",
            type === 'people' ? "grid-cols-1 md:grid-cols-4" : "grid-cols-1 md:grid-cols-3"
          )}>
            
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

            {/* COLUMN 3: TITLE VECTOR (PEOPLE ONLY) */}
            {type === 'people' && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  TITLE_VECTOR
                </h4>
                <div className="flex flex-wrap gap-2">
                  {titleOptions.map(title => (
                    <FilterChip 
                      key={title}
                      label={title}
                      active={isActive('title', title)}
                      onClick={() => toggleFilter('title', title)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* COLUMN 4: GEOSPATIAL_VECTOR */}
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
