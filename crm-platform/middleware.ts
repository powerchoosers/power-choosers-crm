import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/crm-platform')) {
    const hasSession = req.cookies.get('np_session')?.value === '1'
    if (!hasSession) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/crm-platform/:path*']
}
