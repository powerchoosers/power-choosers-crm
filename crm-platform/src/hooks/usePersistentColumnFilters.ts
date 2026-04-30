'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ColumnFiltersState } from '@tanstack/react-table'

const COLUMN_FILTER_STORAGE_PREFIX = 'np_column_filters_'

type StoredColumnFilter = {
  id: string
  value: unknown
}

function normalizeColumnFilters(value: unknown): ColumnFiltersState {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is StoredColumnFilter => {
      return Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as StoredColumnFilter).id === 'string' &&
          Object.prototype.hasOwnProperty.call(item, 'value')
      )
    })
    .map((item) => ({
      id: item.id,
      value: item.value,
    }))
}

function readStoredColumnFilters(storageKey: string): ColumnFiltersState {
  if (typeof window === 'undefined' || !storageKey) return []

  try {
    const raw = window.sessionStorage.getItem(COLUMN_FILTER_STORAGE_PREFIX + storageKey)
    if (!raw) return []
    return normalizeColumnFilters(JSON.parse(raw))
  } catch (_) {
    return []
  }
}

function writeStoredColumnFilters(storageKey: string, filters: ColumnFiltersState) {
  if (typeof window === 'undefined' || !storageKey) return

  try {
    const key = COLUMN_FILTER_STORAGE_PREFIX + storageKey
    if (filters.length === 0) {
      window.sessionStorage.removeItem(key)
      return
    }
    window.sessionStorage.setItem(key, JSON.stringify(filters))
  } catch (_) {}
}

function stableFilterValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value].map((item) => String(item)).sort()
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
        acc[key] = stableFilterValue(entryValue)
        return acc
      }, {})
  }

  return value
}

function hashString(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function buildColumnFilterSignature(filters: ColumnFiltersState): string {
  if (filters.length === 0) return ''

  const normalized = filters
    .map((filter) => ({
      id: filter.id,
      value: stableFilterValue(filter.value),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  return hashString(JSON.stringify(normalized))
}

export function usePersistentColumnFilters(
  storageKey: string
): [ColumnFiltersState, Dispatch<SetStateAction<ColumnFiltersState>>, string] {
  const [columnFilters, setColumnFiltersState] = useState<ColumnFiltersState>(() =>
    readStoredColumnFilters(storageKey)
  )

  useEffect(() => {
    setColumnFiltersState(readStoredColumnFilters(storageKey))
  }, [storageKey])

  const setColumnFilters = useCallback<Dispatch<SetStateAction<ColumnFiltersState>>>(
    (updater) => {
      setColumnFiltersState((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater
        writeStoredColumnFilters(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  const filterSignature = useMemo(() => buildColumnFilterSignature(columnFilters), [columnFilters])

  return [columnFilters, setColumnFilters, filterSignature]
}
