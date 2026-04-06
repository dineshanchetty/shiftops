import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";

const publicRoutes = ["/login", "/signup", "/setup"];

export async function middleware(request: NextRequest) {
  // Refresh the auth session on every request
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;

  // Allow public routes for unauthenticated users
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return response;
  }

  // Protect /app/* routes
  if (pathname.startsWith("/app")) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (public image files)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
