/**
 * Next.js Edge Middleware — Auth & Role-Based Route Protection
 *
 * Closes: #175 (server-side /dashboard/* auth guard)
 *         #176 (redirect-to-intended-page via `?next=` query param)
 *         #177 (role-based guard for /dashboard/manager and /dashboard/users)
 *
 * Strategy
 * --------
 * Firebase does not offer a lightweight server-side token verifier that runs
 * in the Edge runtime (no Node.js crypto primitives available there).  The
 * practical alternative used by the Firebase + Next.js community is to store
 * the raw Firebase ID token in an HttpOnly session cookie (written by the
 * client after every successful sign-in) and to treat its *presence* as proof
 * of a live session in the middleware.  Actual token verification (signature,
 * expiry, custom claims) still happens in every API route / Server Action that
 * needs server-authoritative data — the middleware is purely a UX + SSRF
 * guard, not the sole enforcement layer.
 *
 * Cookie name: `__truestamp_session`
 * Set by:      src/components/auth/Login.tsx (and wallet connect flow) after a
 *              successful Firebase sign-in, via document.cookie with path=/
 *
 * Role cookie: `__truestamp_role`
 * Set by:      the same login flow from the Firebase custom claim `role`
 *              extracted out of the decoded ID token payload.  It is NOT
 *              HttpOnly so that client code can read it too, but middleware
 *              reads it to decide role-gated redirects *before* the page
 *              renders.
 *
 * Also closes: #192 (IP-based rate limiting on /api/auth/* proxy routes)
 *
 * ⚠️  WARNING — do not test; implement only (per task instructions)
 */

import { type NextRequest, NextResponse } from "next/server";

import { checkRateLimit, getClientIp, getRuleForPath } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Route configuration
// ---------------------------------------------------------------------------

/**
 * Dashboard sub-paths that are intentionally public (no login required).
 * Keep in sync with the PUBLIC_ROUTES list in dashboard/layout.tsx.
 */
const PUBLIC_DASHBOARD_PATHS = [
  "/dashboard/event",
  "/dashboard/event/payment",
  "/dashboard/event/details",
  "/dashboard/event/search",
  "/dashboard/event/escrow",
  "/dashboard/event/create-escrow",
];

/** Regex patterns for dynamic public dashboard routes. */
const PUBLIC_DASHBOARD_PATTERNS: RegExp[] = [
  /^\/dashboard\/event\/booking\/.+\/escrow$/,
];

/**
 * Role-restricted paths and the role value that is required to access them.
 * The role value must match what is stored in the `__truestamp_role` cookie.
 */
const ROLE_RESTRICTED_PATHS: Array<{ path: string; requiredRole: string }> = [
  { path: "/dashboard/manager", requiredRole: "manager" },
  { path: "/dashboard/users",   requiredRole: "admin" },
  { path: "/dashboard/admin",   requiredRole: "admin" },
];

const SESSION_COOKIE  = "__truestamp_session";
const ROLE_COOKIE     = "__truestamp_role";
const LOGIN_PAGE      = "/login";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPublicDashboardPath(pathname: string): boolean {
  if (PUBLIC_DASHBOARD_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  return PUBLIC_DASHBOARD_PATTERNS.some((re) => re.test(pathname));
}

function buildLoginUrl(request: NextRequest, next: string): URL {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PAGE;
  loginUrl.search = "";
  // Preserve the originally-requested path so the login page can redirect
  // the user back after a successful sign-in (#176).
  loginUrl.searchParams.set("next", next);
  return loginUrl;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // ── 0. Rate-limit auth proxy routes (#192) ───────────────────────────────
  if (pathname.startsWith("/api/auth")) {
    const rule = getRuleForPath(pathname);
    const key = `${getClientIp(request.headers)}:${pathname}`;
    const result = checkRateLimit(key, rule);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfter) },
        },
      ) as NextResponse;
    }
    return NextResponse.next();
  }

  // ── 1. Only guard /dashboard/* routes ───────────────────────────────────
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // ── 2. Let public dashboard paths through unconditionally ────────────────
  if (isPublicDashboardPath(pathname)) {
    return NextResponse.next();
  }

  // ── 3. Authentication check ──────────────────────────────────────────────
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionCookie) {
    // No session — redirect to /login?next=<original-path>  (#175, #176)
    return NextResponse.redirect(buildLoginUrl(request, pathname));
  }

  // ── 4. Role-based access check  (#177) ───────────────────────────────────
  const roleCookie = request.cookies.get(ROLE_COOKIE)?.value ?? "";

  for (const { path, requiredRole } of ROLE_RESTRICTED_PATHS) {
    if (pathname === path || pathname.startsWith(path + "/")) {
      if (roleCookie !== requiredRole) {
        // Authenticated but wrong role — send to generic dashboard home.
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = "/dashboard/escrow-dashboard";
        dashboardUrl.search = "";
        return NextResponse.redirect(dashboardUrl);
      }
    }
  }

  // ── 5. All checks passed — continue to the page ──────────────────────────
  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Matcher — only run this middleware for dashboard and auth API paths
// ---------------------------------------------------------------------------

export const config = {
  matcher: ["/dashboard/:path*", "/api/auth/:path*"],
};
