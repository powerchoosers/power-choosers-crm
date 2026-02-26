'use client'

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react'

const STORAGE_KEY_PREFIX = 'nodal-table-column-order-'

export function useTableColumnOrder(tableId: string, initialOrder: string[]) {
    const storageKey = `${STORAGE_KEY_PREFIX}${tableId}`

    // State for column order
    const [columnOrder, setColumnOrder] = useState<string[]>(initialOrder)

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey)
            if (stored) {
                const parsed = JSON.parse(stored)
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Merge with initialOrder to handle new columns added in code updates
                    const merged = [...parsed]
                    initialOrder.forEach(col => {
                        if (!merged.includes(col)) {
                            merged.push(col)
                        }
                    })
                    // Remove columns that no longer exist in initialOrder
                    const filtered = merged.filter(col => initialOrder.includes(col))
                    setColumnOrder(filtered)
                }
            }
        } catch (e) {
            console.warn('Failed to load column order from localStorage', e)
        }
    }, [storageKey, initialOrder])

    // Custom setter that persists to localStorage
    const setColumnOrderWithPersistence: Dispatch<SetStateAction<string[]>> = useCallback((updaterOrValue) => {
        setColumnOrder(prev => {
            const nextOrder = typeof updaterOrValue === 'function'
                ? (updaterOrValue as (old: string[]) => string[])(prev)
                : updaterOrValue

            try {
                localStorage.setItem(storageKey, JSON.stringify(nextOrder))
            } catch (e) {
                console.warn('Failed to save column order to localStorage', e)
            }
            return nextOrder
        })
    }, [storageKey])

    return [columnOrder, setColumnOrderWithPersistence] as const
}
