import { NextResponse } from "next/server";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import { grantAllowedRoot } from "@/lib/allowed-roots";

/**
 * Registers a directory the user has explicitly selected as a project
 * workspace. This permits Explorer to show files before a Pi session has been
 * created in that directory.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = await req.json() as { cwd?: unknown };
    if (typeof body.cwd !== "string" || !body.cwd.trim()) {
      return NextResponse.json(
        { error: "Workspace path is required" },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const cwd = await grantAllowedRoot(body.cwd.trim());
    return NextResponse.json({ cwd }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    logApiError({ route: "/api/workspace", method: "POST", requestId, error });
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
}
