import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-utils";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ isAdmin: false }, { status: 401 });

    const user = await currentUser();
    if (!user) return NextResponse.json({ isAdmin: false }, { status: 401 });

    const admin = await isAdmin(userId);
    const userEmail = user.emailAddresses[0]?.emailAddress;

    return NextResponse.json({ isAdmin: admin, email: userEmail, userId });
  } catch (error) {
    console.error("Admin verification error:", error);
    return NextResponse.json({ isAdmin: false }, { status: 500 });
  }
}
