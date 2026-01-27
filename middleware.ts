// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = [
  "/login",
  "/auth",          // includes /auth/callback
  "/_next",
  "/favicon.ico",
  "/images",
  "/public",
  "/assets",
  "/api/switch-org", // leave public only if you truly need it pre-auth
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Early allow for public paths to avoid unnecessary auth call
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Prepare response so Supabase cookie helpers can write refreshed cookies
  const res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          res.cookies.set(name, value, options);
        },
        remove: (name: string, options: any) => {
          res.cookies.set(name, "", { ...options, expires: new Date(0) });
        },
      },
    }
  );

  // Secure: verifies with Auth server
  const { data: { user } = { user: null } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl, { headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|assets|public).*)"],
};
