import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { getRequiredRoles } from "@/lib/page-permissions";

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

    // --- Role-based route protection ---
    const requiredRoles = getRequiredRoles(pathname);

    // If no roles are defined for this route, allow access (unrestricted)
    if (requiredRoles.length > 0) {
      // Check for cached role in cookie first (avoids extra DB query)
      let userRole = request.cookies.get("x-user-role")?.value;

      if (!userRole) {
        // Fetch role from tenant_members
        const { data: member } = await supabase
          .from("tenant_members")
          .select("role")
          .eq("user_id", user.id)
          .single();

        userRole = member?.role ?? undefined;

        // Cache the role in a cookie on the response (expires in 5 min)
        if (userRole) {
          response.cookies.set("x-user-role", userRole, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 300, // 5 minutes
            path: "/",
          });
        }
      }

      if (!userRole || !requiredRoles.includes(userRole)) {
        const url = request.nextUrl.clone();
        url.pathname = "/app";
        url.searchParams.set("error", "insufficient_permissions");
        return NextResponse.redirect(url);
      }
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
