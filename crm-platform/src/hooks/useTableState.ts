import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'

interface TableStateOptions {
  pageSize?: number
  prefix?: string // In case there are multiple tables on one page
}

export function useTableState(options: TableStateOptions = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const pageSize = options.pageSize || 50
  const prefix = options.prefix ? `${options.prefix}_` : ''
  
  const pageParam = `${prefix}page`
  const searchParam = `${prefix}q`

  // Get current values from URL
  const currentPage = useMemo(() => {
    const page = searchParams.get(pageParam)
    return page ? Math.max(0, parseInt(page) - 1) : 0
  }, [searchParams, pageParam])

  const searchQuery = useMemo(() => {
    return searchParams.get(searchParam) || ''
  }, [searchParams, searchParam])

  // Helper to update URL params
  const updateParams = useCallback((newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })

    const newString = params.toString()
    const oldString = searchParams.toString()

    // Only update if params actually changed to avoid infinite loops/re-renders
    if (newString !== oldString) {
      router.replace(`${pathname}?${newString}`, { scroll: false })
    }
  }, [router, pathname, searchParams])

  const setPage = useCallback((pageIndex: number) => {
    updateParams({ [pageParam]: (pageIndex + 1).toString() })
  }, [updateParams, pageParam])

  const setSearch = useCallback((query: string) => {
    const currentQuery = searchParams.get(searchParam) || ''
    // Only update if query actually changed to avoid resetting page unnecessarily
    if (query !== currentQuery) {
      updateParams({ 
        [searchParam]: query,
        [pageParam]: '1' // Reset to first page on search
      })
    }
  }, [updateParams, searchParam, pageParam, searchParams])

  return {
    pageIndex: currentPage,
    pageSize,
    searchQuery,
    setPage,
    setSearch,
    pagination: {
      pageIndex: currentPage,
      pageSize,
    }
  }
}
