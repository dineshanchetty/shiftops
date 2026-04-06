import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.json({ cleared: true });

  // Clear all Supabase auth cookies
  const cookieNames = [
    "sb-twueamtpxsbejihsmduc-auth-token",
    "sb-twueamtpxsbejihsmduc-auth-token.0",
    "sb-twueamtpxsbejihsmduc-auth-token.1",
    "x-user-role",
  ];

  for (const name of cookieNames) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
