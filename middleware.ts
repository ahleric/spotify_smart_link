import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminAuthConfig } from './lib/config';

export function middleware(request: NextRequest) {
  const { username, password } = adminAuthConfig;
  if (!username || !password) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="SmartLink Admin"' },
    });
  }

  const base64Credentials = authHeader.split(' ')[1] ?? '';
  const decoded = atob(base64Credentials);
  const [user, ...rest] = decoded.split(':');
  const pass = rest.join(':');

  if (user !== username || pass !== password) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="SmartLink Admin"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
