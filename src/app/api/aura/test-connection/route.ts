import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { branchId } = body as { branchId: string };

    if (!branchId) {
      return NextResponse.json(
        { success: false, message: "branchId is required" },
        { status: 400 }
      );
    }

    // Fetch branch SFTP credentials
    const { data: branch, error } = await supabase
      .from("branches")
      .select(
        "aura_ftp_host, aura_ftp_user, aura_ftp_pass_encrypted, aura_export_path"
      )
      .eq("id", branchId)
      .single();

    if (error || !branch) {
      return NextResponse.json(
        { success: false, message: "Branch not found" },
        { status: 404 }
      );
    }

    // Validate that all required SFTP fields are present
    if (!branch.aura_ftp_host || !branch.aura_ftp_user) {
      return NextResponse.json({
        success: false,
        message:
          "SFTP credentials are incomplete. Please provide host and username.",
      });
    }

    // Validate host format (basic check)
    const hostPattern = /^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9]$/;
    if (!hostPattern.test(branch.aura_ftp_host)) {
      return NextResponse.json({
        success: false,
        message:
          "Invalid SFTP host format. Please enter a valid hostname or IP address.",
      });
    }

    // In production, we would attempt an actual SFTP connection here
    // using a library like ssh2-sftp-client. For now, return success
    // if credentials are well-formed.
    return NextResponse.json({
      success: true,
      message: `SFTP credentials validated for ${branch.aura_ftp_host}. Connection test will be available once SFTP integration is deployed.`,
    });
  } catch (err) {
    console.error("Test connection error:", err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
